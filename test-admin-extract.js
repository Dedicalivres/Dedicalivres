#!/usr/bin/env node

import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker from './dedicalivres-daily-export.js';

const storedFiles = new Map();
const originalFetch = globalThis.fetch;

const events = [
  {
    id: 'event-be-overlap',
    title: 'Dédicace en Wallonie',
    description: 'Une rencontre qui chevauche la période choisie.',
    type: 'Dédicace',
    country_code: 'BE',
    city: 'Namur',
    region: 'Wallonie',
    start_date: '2026-06-01',
    end_date: '2026-06-20',
    website: 'https://example.test/wallonie',
    image_url: 'https://example.test/wallonie.jpg',
    price: 'Gratuit',
    lat: 50.46,
    lng: 4.86,
    validated: true,
    rejected: false,
    featured: false,
    verified: true,
    created_at: '2026-05-01T10:00:00Z'
  },
  {
    id: 'event-be-festival',
    title: 'Festival à Bruxelles',
    description: 'Un festival hors catégorie demandée.',
    type: 'Festival',
    country_code: 'BE',
    city: 'Bruxelles',
    region: 'Bruxelles-Capitale',
    start_date: '2026-06-15',
    end_date: null,
    website: '',
    image_url: '',
    price: '',
    lat: null,
    lng: null,
    validated: true,
    rejected: false,
    featured: false,
    verified: false,
    created_at: '2026-05-02T10:00:00Z'
  },
  {
    id: 'event-fr-dedicace',
    title: 'Dédicace en France',
    description: 'Un événement hors pays demandé.',
    type: 'Dédicace',
    country_code: 'FR',
    city: 'Lille',
    region: 'Hauts-de-France',
    start_date: '2026-06-15',
    end_date: null,
    website: '',
    image_url: '',
    price: '',
    lat: null,
    lng: null,
    validated: true,
    rejected: false,
    featured: false,
    verified: false,
    created_at: '2026-05-03T10:00:00Z'
  }
];

globalThis.fetch = async (input) => {
  const url = new URL(typeof input === 'string' ? input : input.url);

  if (url.pathname === '/auth/v1/user') {
    return Response.json({ id: 'admin-user-id', email: 'admin@example.test' });
  }

  if (url.pathname.endsWith('/admin_users')) {
    return Response.json([{ user_id: 'admin-user-id' }]);
  }

  if (url.pathname.endsWith('/event_authors_presence')) {
    return Response.json([
      {
        event_id: 'event-be-overlap',
        pseudo: 'Autrice Test',
        validated: true,
        rejected: false
      }
    ]);
  }

  if (url.pathname.endsWith('/events')) {
    return Response.json(events);
  }

  return new Response('Not found', { status: 404 });
};

const env = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key',
  PUBLIC_SITE_URL: 'https://dedicalivres.fr',
  R2_PUBLIC_BASE_URL: 'https://assets.example.test',
  EXPORT_PREFIX: 'exports',
  EVENTS_TABLE: 'events',
  PRESENCE_TABLE: 'event_authors_presence',
  EXPORTS_BUCKET: {
    async put(key, body, options) {
      storedFiles.set(key, { body, options });
    }
  }
};

try {
  const request = new Request('https://worker.example.test/admin-extract', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-admin-session',
      'Content-Type': 'application/json',
      Origin: 'http://127.0.0.1:8766'
    },
    body: JSON.stringify({
      category: 'dedicaces',
      countryCode: 'BE',
      region: 'Wallonie',
      dateStart: '2026-06-14',
      dateEnd: '2026-06-16',
      formats: ['json', 'csv', 'markdown', 'html']
    })
  });

  const response = await worker.fetch(request, env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8766');
  assert.equal(payload.ok, true);
  assert.equal(payload.event_count, 1);
  assert.equal(payload.filters.category, 'dedicaces');
  assert.equal(payload.filters.country_code, 'BE');
  assert.equal(payload.filters.territory, 'Wallonie');
  assert.equal(payload.files.length, 5);
  assert.equal(storedFiles.size, 5);

  const jsonFile = [...storedFiles.entries()].find(([key]) => key.endsWith('/evenements.json'));
  assert.ok(jsonFile);

  const exportedJson = JSON.parse(jsonFile[1].body);
  assert.equal(exportedJson.events.length, 1);
  assert.equal(exportedJson.events[0].id, 'event-be-overlap');
  assert.equal(exportedJson.events[0].authors[0], 'Autrice Test');
  assert.equal(exportedJson.events[0].country, 'Belgique');

  const galleryFile = [...storedFiles.entries()].find(([key]) => key.endsWith('/galerie-visuelle.html'));
  assert.ok(galleryFile);
  assert.match(galleryFile[1].body, /Galerie visuelle prête à publier/);
  assert.match(galleryFile[1].body, /Télécharger le PNG/);
  assert.match(galleryFile[1].body, /Dédicace en Wallonie/);
  assert.match(galleryFile[1].body, /calculateAdaptiveLayout/);
  assert.match(galleryFile[1].body, /getEventTheme/);
  assert.match(galleryFile[1].body, /drawImageContain/);

  const visualScript = galleryFile[1].body.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/)?.[1];
  assert.ok(visualScript);

  const visualWindow = {
    addEventListener() {},
    isSecureContext: false
  };
  const visualDocument = {
    getElementById(id) {
      if (id === 'events-data') return { textContent: '[]' };
      if (id === 'gallery') return { appendChild() {} };
      return null;
    }
  };

  vm.runInNewContext(visualScript, {
    window: visualWindow,
    document: visualDocument,
    console,
    JSON,
    Math,
    String,
    Array,
    Date,
    Intl,
    Promise,
    URL,
    navigator: {}
  });

  const visualEngine = visualWindow.__DEDICALIVRES_VISUAL_ENGINE__;
  assert.ok(visualEngine);

  const layoutCases = [
    {
      mode: 'portrait',
      event: { title: 'Grande dédicace littéraire', authors: ['Autrice Test'] },
      image: { naturalWidth: 700, naturalHeight: 1100 }
    },
    {
      mode: 'balanced',
      event: { title: 'Salon du livre', authors: [] },
      image: { naturalWidth: 900, naturalHeight: 900 }
    },
    {
      mode: 'landscape',
      event: {
        title: 'Festival international des littératures et des rencontres passionnées',
        authors: ['Autrice Test']
      },
      image: { naturalWidth: 1600, naturalHeight: 850 }
    },
    {
      mode: 'landscape',
      event: { title: 'Rencontre panoramique', authors: [] },
      image: { naturalWidth: 2200, naturalHeight: 650 }
    }
  ];

  layoutCases.forEach(({ mode, event, image }) => {
    const layout = visualEngine.calculateAdaptiveLayout({}, event, image);
    assert.equal(layout.mode, mode);
    assertLayoutInsideSafeArea(layout.image);
    assertLayoutInsideSafeArea(layout.presentation);
    assert.equal(rectanglesOverlap(layout.image, layout.presentation), false);
    if (mode === 'landscape') {
      assert.ok(layout.presentation.height >= 420);
    }
  });

  assert.equal(visualEngine.getEventTheme('Dédicace').primary, '#7137b6');
  assert.equal(visualEngine.getEventTheme('Festival').primary, '#f06a2f');
  assert.equal(visualEngine.getEventTheme('Salon').primary, '#2784c7');
  assert.equal(visualEngine.getEventTheme('Rencontre').primary, '#24936f');

  const unauthorizedResponse = await worker.fetch(new Request('https://worker.example.test/admin-extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://dedicalivres.fr'
    },
    body: JSON.stringify({})
  }), env);

  assert.equal(unauthorizedResponse.status, 401);
  console.log('OK — extraction admin authentifiée, filtrée et stockée dans R2.');
} finally {
  globalThis.fetch = originalFetch;
}

function assertLayoutInsideSafeArea(box) {
  assert.ok(box.width > 0);
  assert.ok(box.height > 0);
  assert.ok(box.x >= 72);
  assert.ok(box.y >= 215);
  assert.ok(box.x + box.width <= 1008.001);
  assert.ok(box.y + box.height <= 1145.001);
}

function rectanglesOverlap(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}
