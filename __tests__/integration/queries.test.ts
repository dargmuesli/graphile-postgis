import * as fs from "fs";
import * as path from "path";
import * as pg from "pg";
import { promisify } from "util";
import type { GraphQLSchema } from "postgraphile/graphql";
import { grafast } from "postgraphile/grafast";
import { makePostGraphileSchema } from "../helpers";

const readFile = promisify(fs.readFile);

const queriesDir = `${__dirname}/../fixtures/queries`;
const queryFileNames = fs.readdirSync(queriesDir);

const schemas = ["graphile_postgis"];

let pool: pg.Pool;
let schema: GraphQLSchema;
let resolvedPreset: GraphileConfig.ResolvedPreset;

beforeAll(async () => {
  pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
  });
  const result = await makePostGraphileSchema(pool, schemas);
  schema = result.schema;
  resolvedPreset = result.resolvedPreset;
});

afterAll(async () => {
  await pool.end();
});

for (const queryFileName of queryFileNames) {
  test(queryFileName, async () => {
    const query = await readFile(
      path.resolve(queriesDir, queryFileName),
      "utf8"
    );
    const result = await grafast({
      schema,
      source: query,
      resolvedPreset,
      requestContext: {},
    });
    expect(result).toMatchSnapshot();
  });
}
