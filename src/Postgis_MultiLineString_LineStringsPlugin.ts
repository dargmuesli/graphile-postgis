import type { GraphQLOutputType } from "postgraphile/graphql";
import { GIS_SUBTYPE } from "./constants";
import { getGISTypeName } from "./utils";
import { version } from "../package.json";

export const Postgis_MultiLineString_LineStringsPlugin: GraphileConfig.Plugin =
  {
    name: "Postgis_MultiLineString_LineStringsPlugin",
    description: "Enhancing the `MultiLineString` type",
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
            pgGISTypeDetails.subtype !== GIS_SUBTYPE.MultiLineString
          ) {
            return fields;
          }
          const {
            extend,
            getPostgisTypeByGeometryType,
            graphql: { GraphQLList },
          } = build;
          const hasZ = pgGISTypeDetails.hasZ;
          const hasM = pgGISTypeDetails.hasM;
          const srid = pgGISTypeDetails.srid;
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
