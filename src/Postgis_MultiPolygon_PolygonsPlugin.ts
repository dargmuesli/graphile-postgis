import type { GraphQLOutputType } from "postgraphile/graphql";
import { GIS_SUBTYPE } from "./constants";
import { getGISTypeName } from "./utils";
import { version } from "../package.json";

export const Postgis_MultiPolygon_PolygonsPlugin: GraphileConfig.Plugin = {
  name: "Postgis_MultiPolygon_PolygonsPlugin",
  version,

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const {
          scope: {
            isPgGISType,
            pgGISTypeName,
            pgGISSubtype,
            pgGISHasZ,
            pgGISHasM,
            pgGISSrid,
          },
        } = context;
        if (!isPgGISType || pgGISSubtype !== GIS_SUBTYPE.MultiPolygon) {
          return fields;
        }
        const {
          extend,
          getPostgisTypeByGeometryType,
          graphql: { GraphQLList },
        } = build;
        const hasZ = pgGISHasZ!;
        const hasM = pgGISHasM!;
        const srid = pgGISSrid!;
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
              resolve(data: any) {
                return data.__geojson.coordinates.map((coord: any) => ({
                  __gisType: getGISTypeName(GIS_SUBTYPE.Polygon, hasZ, hasM),
                  __srid: data.__srid,
                  __geojson: {
                    type: "Polygon",
                    coordinates: coord,
                  },
                }));
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
