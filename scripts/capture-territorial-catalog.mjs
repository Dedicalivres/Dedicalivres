import fs from 'node:fs';
import {fetchPublicEvents} from './territorial-catalog.mjs';

const snapshotPath =
  'docs/territoires/catalogue-public.json';

const source =
  'Public events API: validated=true, rejected=false; complete ID cursor pagination';


const config =
  fs.readFileSync(
    'config.js',
    'utf8'
  );


const url =
  config.match(
    /supabaseUrl:\s*["']([^"']+)/
  )[1];


const key =
  config.match(
    /supabaseAnonKey:\s*["']([^"']+)/
  )[1];


const events =
  await fetchPublicEvents({
    supabaseUrl:
      url,

    supabaseAnonKey:
      key
  });


let previous =
  null;


try {

  previous =
    JSON.parse(
      fs.readFileSync(
        snapshotPath,
        'utf8'
      )
    );

} catch {

  previous =
    null;

}


const sameEvents =
  Boolean(
    previous
    && previous.source === source
    && Array.isArray(
      previous.events
    )
    && JSON.stringify(
      previous.events
    ) === JSON.stringify(
      events
    )
  );


const capturedAt =
  sameEvents
    ? previous.capturedAt
    : new Date()
        .toISOString();


const snapshot = {
  capturedAt,
  source,
  events
};


fs.writeFileSync(
  snapshotPath,
  JSON.stringify(
    snapshot,
    null,
    2
  )
);


console.log(
  JSON.stringify(
    {
      total:
        events.length,

      snapshotChanged:
        !sameEvents,

      capturedAt,

      territories:
        events.reduce(
          (
            result,
            event
          ) => {

            const key = [
              event.country_code,
              event.region
            ].join('/');


            result[key] =
              (
                result[key]
                || 0
              )
              + 1;


            return result;
          },
          {}
        )
    },
    null,
    2
  )
);
