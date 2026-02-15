import * as fs from "fs";
import * as path from "path";
import * as pg from "pg";
import { promisify } from "util";
import { GraphQLSchema, graphql } from "postgraphile/graphql";
import { withPgClient, withPgPool, makePostGraphileSchema } from "../helpers";

const readFile = promisify(fs.readFile);

const queriesDir = `${__dirname}/../fixtures/queries`;
const queryFileNames = fs.readdirSync(queriesDir);

const schemas = ["graphile_postgis"];

let schema: GraphQLSchema;

beforeAll(async () => {
  await withPgPool(async (pool: pg.Pool) => {
    schema = (await makePostGraphileSchema(pool, schemas)).schema;
  });
});

for (const queryFileName of queryFileNames) {
  test(queryFileName, async () => {
    const query = await readFile(
      path.resolve(queriesDir, queryFileName),
      "utf8"
    );
    const result = await withPgClient(async (client: pg.PoolClient) =>
      graphql({ schema, source: query, contextValue: { pgClient: client } })
    );
    expect(result).toMatchSnapshot();
  });
}
