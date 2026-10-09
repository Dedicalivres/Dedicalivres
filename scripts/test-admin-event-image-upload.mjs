import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

class TestFile extends Blob {
  constructor(parts, name, options = {}) {
    super(parts, options);
    this.name = name;
  }
}

const moduleSource = fs.readFileSync("admin-event-image.js", "utf8");
const shellSource = fs.readFileSync("admin-shell.js", "utf8");
const activeHtml = fs.readFileSync("admin.html", "utf8");
const referenceHtml = fs.readFileSync("admin-v11.html", "utf8");
const sandbox = {
  window: {},
  File: TestFile,
  FormData,
  URL
};

vm.runInNewContext(moduleSource, sandbox);
const imageUpload = sandbox.window.DEDICALIVRES_ADMIN_EVENT_IMAGE;
assert.ok(imageUpload, "Le module d’upload événement doit être exposé");
assert.equal(imageUpload.MAX_BYTES, 5 * 1024 * 1024);

const validFile = new TestFile(
  [new Uint8Array(128)],
  "affiche.png",
  { type: "image/png" }
);
assert.doesNotThrow(() => imageUpload.validate(validFile));

const exactLimit = new TestFile(
  [new Uint8Array(5 * 1024 * 1024)],
  "limite.webp",
  { type: "image/webp" }
);
assert.doesNotThrow(() => imageUpload.validate(exactLimit));

const tooLarge = new TestFile(
  [new Uint8Array(5 * 1024 * 1024 + 1)],
  "trop-grand.jpg",
  { type: "image/jpeg" }
);
assert.throws(() => imageUpload.validate(tooLarge), /5 Mo/);
assert.throws(
  () => imageUpload.validate(new TestFile(["texte"], "note.txt", { type: "text/plain" })),
  /Format non accepté/
);

let uploadCalls = 0;
const uploadedUrl = await imageUpload.upload(validFile, {
  config: {
    imageUploadProvider: "r2",
    imageUploadEndpoint: "https://upload.example.test/"
  },
  fetcher: async (url, options) => {
    uploadCalls += 1;
    assert.equal(url, "https://upload.example.test/");
    assert.equal(options.method, "POST");
    assert.equal(options.body.get("folder"), "event-images");
    assert.equal(options.body.get("file").name, "affiche.png");
    return new Response(
      JSON.stringify({ url: "https://pub.example.test/event-images/affiche.png" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
});
assert.equal(uploadCalls, 1);
assert.equal(uploadedUrl, "https://pub.example.test/event-images/affiche.png");

const successOptions = {
  config: {
    imageUploadProvider: "r2",
    imageUploadEndpoint: "https://upload.example.test/"
  },
  fetcher: async () => new Response(
    JSON.stringify({ url: "https://pub.example.test/event-images/nouvelle.png" }),
    { status: 200, headers: { "content-type": "application/json" } }
  )
};

assert.equal(
  await imageUpload.resolve(null, validFile, successOptions),
  "https://pub.example.test/event-images/nouvelle.png",
  "Un événement sans image reçoit l’URL R2"
);
assert.equal(
  await imageUpload.resolve("https://pub.example.test/event-images/ancienne.png", validFile, successOptions),
  "https://pub.example.test/event-images/nouvelle.png",
  "Une image existante est remplacée après upload réussi"
);
assert.equal(
  await imageUpload.resolve("https://pub.example.test/event-images/ancienne.png", null, successOptions),
  "https://pub.example.test/event-images/ancienne.png",
  "Une édition sans nouveau fichier conserve l’image"
);

await assert.rejects(
  imageUpload.upload(tooLarge, {
    config: {
      imageUploadProvider: "r2",
      imageUploadEndpoint: "https://upload.example.test/"
    },
    fetcher: async () => {
      uploadCalls += 1;
      throw new Error("ne doit pas être appelé");
    }
  }),
  /5 Mo/
);
assert.equal(uploadCalls, 1, "Un fichier refusé ne doit jamais atteindre le Worker");

await assert.rejects(
  imageUpload.upload(validFile, {
    config: {
      imageUploadProvider: "r2",
      imageUploadEndpoint: "https://upload.example.test/"
    },
    fetcher: async () => new Response(
      JSON.stringify({ error: "R2 indisponible" }),
      { status: 503, headers: { "content-type": "application/json" } }
    )
  }),
  /R2 indisponible/
);

const failedPayload = {
  image_url: "https://pub.example.test/event-images/ancienne.png"
};
await assert.rejects(
  async () => {
    failedPayload.image_url = await imageUpload.resolve(
      failedPayload.image_url,
      validFile,
      {
        config: {
          imageUploadProvider: "r2",
          imageUploadEndpoint: "https://upload.example.test/"
        },
        fetcher: async () => new Response(
          JSON.stringify({ error: "R2 indisponible" }),
          { status: 503, headers: { "content-type": "application/json" } }
        )
      }
    );
  },
  /R2 indisponible/
);
assert.equal(
  failedPayload.image_url,
  "https://pub.example.test/event-images/ancienne.png",
  "Un échec d’upload conserve l’ancienne image_url"
);

await assert.rejects(
  imageUpload.upload(validFile, {
    config: {
      imageUploadProvider: "r2",
      imageUploadEndpoint: "https://upload.example.test/"
    },
    fetcher: async () => new Response(
      JSON.stringify({ url: "javascript:alert(1)" }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  }),
  /Upload R2 impossible/
);

assert.match(referenceHtml, /admin-event-image\.js/);
assert.match(activeHtml, /id="v11-edit-image-file"/);
assert.match(activeHtml, /accept="image\/jpeg,image\/png,image\/webp/);
assert.match(activeHtml, /id="v11-edit-image-feedback"/);
assert.match(activeHtml, /admin-event-image\.js/);
assert.match(activeHtml, /admin-shell\.js\?v=[a-z0-9-]+/);
assert.match(shellSource, /URL\.createObjectURL\(file\)/);
assert.match(shellSource, /L’image précédente est conservée/);
assert.match(shellSource, /payload\.image_url\s*=\s*[\s\S]*?eventImageUpload\.resolve/);
assert.ok(
  shellSource.indexOf("eventImageUpload.resolve") < shellSource.indexOf('.from("events")', shellSource.indexOf("async function saveV11EventEdition")),
  "L’upload doit réussir avant la mise à jour de events.image_url"
);
assert.doesNotMatch(moduleSource, /supabase|storage\.from/i);

console.log("ADMIN_EVENT_IMAGE_UPLOAD_OK");
