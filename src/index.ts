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

    Postgis_Point_LatitudeLongitudePlugin,
    Postgis_LineString_PointsPlugin,
    Postgis_Polygon_RingsPlugin,
    Postgis_MultiPoint_PointsPlugin,
    Postgis_MultiLineString_LineStringsPlugin,
    Postgis_MultiPolygon_PolygonsPlugin,
    Postgis_GeometryCollection_GeometriesPlugin,
  ],
};

export default PostgisPreset;

export {
  PostgisVersionPlugin,
  PostgisInflectionPlugin,
  PostgisExtensionDetectionPlugin,
  PostgisRegisterTypesPlugin,
  PostgisColumnsPlugin,
  Postgis_Point_LatitudeLongitudePlugin,
  Postgis_LineString_PointsPlugin,
  Postgis_Polygon_RingsPlugin,
  Postgis_MultiPoint_PointsPlugin,
  Postgis_MultiLineString_LineStringsPlugin,
  Postgis_MultiPolygon_PolygonsPlugin,
  Postgis_GeometryCollection_GeometriesPlugin,
  PostgisPreset,
};

export type {
  Subtype,
  GISTypeDetails,
  GeoJSONCoordinates,
  GeoJSONGeometry,
  PostGISResolvedData,
  GISTypeInflectionDetails,
  GISInterfaceInflectionDetails,
  GISDimensionInterfaceInflectionDetails,
  GISFieldInflectionDetails,
} from "./types";

declare global {
  namespace GraphileConfig {
    interface Plugins {
      PostgisVersionPlugin: true;
      PostgisInflectionPlugin: true;
      PostgisExtensionDetectionPlugin: true;
      PostgisRegisterTypesPlugin: true;
      PostgisColumnsPlugin: true;
      Postgis_Point_LatitudeLongitudePlugin: true;
      Postgis_LineString_PointsPlugin: true;
      Postgis_Polygon_RingsPlugin: true;
      Postgis_MultiPoint_PointsPlugin: true;
      Postgis_MultiLineString_LineStringsPlugin: true;
      Postgis_MultiPolygon_PolygonsPlugin: true;
      Postgis_GeometryCollection_GeometriesPlugin: true;
    }
  }
}
