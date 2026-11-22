import type { Step } from "postgraphile/grafast";
import type { PostGISResolvedData } from "./types.ts";
import { GIS_SUBTYPE } from "./constants.ts";
import { version } from "./version.ts";

const getXCoordinate = (data: PostGISResolvedData) =>
  (data.__geojson.coordinates as number[])[0];

const getYCoordinate = (data: PostGISResolvedData) =>
  (data.__geojson.coordinates as number[])[1];

const getZCoordinate = (data: PostGISResolvedData) =>
  (data.__geojson.coordinates as number[])[2];

export const Postgis_Point_LatitudeLongitudePlugin: GraphileConfig.Plugin = {
  name: "Postgis_Point_LatitudeLongitudePlugin",
  description: "Enhancing the `Point` type",
  version,

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const { pgGISType } = context.scope;
        if (pgGISType?.subtype !== GIS_SUBTYPE.Point) {
          return fields;
        }
        const {
          extend,
          grafast: { lambda },
          graphql: { GraphQLNonNull, GraphQLFloat },
          inflection,
        } = build;
        const details = {
          typeName: pgGISType.typeName,
          codec: pgGISType.codec,
          scope: context.scope,
        };
        const xFieldName = inflection.gisXFieldName(details);
        const yFieldName = inflection.gisYFieldName(details);
        const zFieldName = inflection.gisZFieldName(details);
        return extend(
          fields,
          {
            [xFieldName]: {
              type: new GraphQLNonNull(GraphQLFloat),
              plan($data: Step<PostGISResolvedData>) {
                return lambda($data, getXCoordinate);
              },
            },
            [yFieldName]: {
              type: new GraphQLNonNull(GraphQLFloat),
              plan($data: Step<PostGISResolvedData>) {
                return lambda($data, getYCoordinate);
              },
            },
            ...(pgGISType.hasZ
              ? {
                  [zFieldName]: {
                    type: new GraphQLNonNull(GraphQLFloat),
                    plan($data: Step<PostGISResolvedData>) {
                      return lambda($data, getZCoordinate);
                    },
                  },
                }
              : {}),
          },
          "PostGIS Point lat/lon fields"
        );
      },
    },
  },
};

export default Postgis_Point_LatitudeLongitudePlugin;
