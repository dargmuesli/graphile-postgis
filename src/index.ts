import type {} from "postgraphile";

import { PostgisVersionPlugin } from "./PostgisVersionPlugin";
import { PostgisInflectionPlugin } from "./PostgisInflectionPlugin";
import { PostgisExtensionDetectionPlugin } from "./PostgisExtensionDetectionPlugin";
import { PostgisRegisterTypesPlugin } from "./PostgisRegisterTypesPlugin";
import { PostgisColumnsPlugin } from "./PostgisColumnsPlugin";
import { Postgis_Point_LatitudeLongitudePlugin } from "./Postgis_Point_LatitudeLongitudePlugin";
import { Postgis_GeometryCollection_GeometriesPlugin } from "./Postgis_GeometryCollection_GeometriesPlugin";
import { Postgis_LineString_PointsPlugin } from "./Postgis_LineString_PointsPlugin";
import { Postgis_Polygon_RingsPlugin } from "./Postgis_Polygon_RingsPlugin";
import { Postgis_MultiPoint_PointsPlugin } from "./Postgis_MultiPoint_PointsPlugin";
import { Postgis_MultiLineString_LineStringsPlugin } from "./Postgis_MultiLineString_LineStringsPlugin";
import { Postgis_MultiPolygon_PolygonsPlugin } from "./Postgis_MultiPolygon_PolygonsPlugin";

const PostgisPreset: GraphileConfig.Preset = {
  plugins: [
    PostgisVersionPlugin,
    PostgisInflectionPlugin,
    PostgisExtensionDetectionPlugin,
    PostgisRegisterTypesPlugin,
    PostgisColumnsPlugin,

    // Enhancing the `Point` type:
    Postgis_Point_LatitudeLongitudePlugin,

    // Enhancing the `LineString` type:
    Postgis_LineString_PointsPlugin,

    // Enhancing the `Polygon` type:
    Postgis_Polygon_RingsPlugin,

    // Enhancing the `MultiPoint` type:
    Postgis_MultiPoint_PointsPlugin,

    // Enhancing the `MultiLineString` type:
    Postgis_MultiLineString_LineStringsPlugin,

    // Enhancing the `MultiPolygon` type:
    Postgis_MultiPolygon_PolygonsPlugin,

    // Enhancing the `GeometryCollection` type:
    Postgis_GeometryCollection_GeometriesPlugin,
  ],
};

export default PostgisPreset;
