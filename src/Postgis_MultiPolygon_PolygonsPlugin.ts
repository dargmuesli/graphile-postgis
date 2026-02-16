import type { GraphQLOutputType } from "postgraphile/graphql";
import type { PostGISResolvedData } from "./types";
import { GIS_SUBTYPE } from "./constants";
import { getGISTypeName } from "./utils";
import { version } from "./version";

export const Postgis_MultiPolygon_PolygonsPlugin: GraphileConfig.Plugin = {
  name: "Postgis_MultiPolygon_PolygonsPlugin",
  description: "Enhancing the `MultiPolygon` type",
  version,

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const {
          scope: { isPgGISType, pgGISTypeName, pgGISTypeDetails },
        } = context;
        if (
          !isPgGISType ||
          !pgGISTypeDetails ||
          pgGISTypeDetails.subtype !== GIS_SUBTYPE.MultiPolygon
        ) {
          return fields;
        }
        const {
          extend,
          getPostgisTypeByGeometryType,
          graphql: { GraphQLList },
        } = build;
        const { hasZ, hasM, srid } = pgGISTypeDetails;
        const polygonTypeName = getPostgisTypeByGeometryType(
          pgGISTypeName!,
          GIS_SUBTYPE.Polygon,
          hasZ,
          hasM,
          srid
        );
        const Polygon = polygonTypeName
          ? (build.getTypeByName(polygonTypeName) as GraphQLOutputType)
          : null;
        if (!Polygon) return fields;

        return extend(
          fields,
          {
            polygons: {
              type: new GraphQLList(Polygon),
              resolve(data: PostGISResolvedData) {
                return (data.__geojson.coordinates as number[][][][]).map(
                  (coord) => ({
                    __gisType: getGISTypeName(GIS_SUBTYPE.Polygon, hasZ, hasM),
                    __srid: data.__srid,
                    __geojson: {
                      type: "Polygon",
                      coordinates: coord,
                    },
                  })
                );
              },
            },
          },
          "PostGIS MultiPolygon polygons field"
        );
      },
    },
  },
};

export default Postgis_MultiPolygon_PolygonsPlugin;
