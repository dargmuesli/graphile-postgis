import { GIS_SUBTYPE } from "./constants";
import { version } from "../package.json";

export const Postgis_Point_LatitudeLongitudePlugin: GraphileConfig.Plugin = {
  name: "Postgis_Point_LatitudeLongitudePlugin",
  version,

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const {
          scope: { isPgGISType, pgGISTypeName, pgGISSubtype, pgGISHasZ },
        } = context;
        if (!isPgGISType || pgGISSubtype !== GIS_SUBTYPE.Point) {
          return fields;
        }
        const {
          extend,
          graphql: { GraphQLNonNull, GraphQLFloat },
          inflection,
        } = build;
        const xFieldName = inflection.gisXFieldName(pgGISTypeName!);
        const yFieldName = inflection.gisYFieldName(pgGISTypeName!);
        const zFieldName = inflection.gisZFieldName(pgGISTypeName!);
        return extend(
          fields,
          {
            [xFieldName]: {
              type: new GraphQLNonNull(GraphQLFloat),
              resolve(data: any) {
                return data.__geojson.coordinates[0];
              },
            },
            [yFieldName]: {
              type: new GraphQLNonNull(GraphQLFloat),
              resolve(data: any) {
                return data.__geojson.coordinates[1];
              },
            },
            ...(pgGISHasZ
              ? {
                  [zFieldName]: {
                    type: new GraphQLNonNull(GraphQLFloat),
                    resolve(data: any) {
                      return data.__geojson.coordinates[2];
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
