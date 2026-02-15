import type { GraphQLOutputType } from "postgraphile/graphql";
import { GIS_SUBTYPE } from "./constants";
import { getGISTypeName } from "./utils";
import { version } from "../package.json";

export const Postgis_MultiLineString_LineStringsPlugin: GraphileConfig.Plugin =
  {
    name: "Postgis_MultiLineString_LineStringsPlugin",
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
          if (!isPgGISType || pgGISSubtype !== GIS_SUBTYPE.MultiLineString) {
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
          const lineStringTypeName = getPostgisTypeByGeometryType(
            pgGISTypeName!,
            GIS_SUBTYPE.LineString,
            hasZ,
            hasM,
            srid
          );
          const LineString = lineStringTypeName
            ? (build.getTypeByName(lineStringTypeName) as GraphQLOutputType)
            : null;
          if (!LineString) return fields;

          return extend(
            fields,
            {
              lines: {
                type: new GraphQLList(LineString),
                resolve(data: any) {
                  return data.__geojson.coordinates.map((coord: any) => ({
                    __gisType: getGISTypeName(
                      GIS_SUBTYPE.LineString,
                      hasZ,
                      hasM
                    ),
                    __srid: data.__srid,
                    __geojson: {
                      type: "LineString",
                      coordinates: coord,
                    },
                  }));
                },
              },
            },
            "PostGIS MultiLineString lines field"
          );
        },
      },
    },
  };

export default Postgis_MultiLineString_LineStringsPlugin;
