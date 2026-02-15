import { Subtype } from "./interfaces";
import { SUBTYPE_STRING_BY_SUBTYPE } from "./constants";
import { version } from "../package.json";

declare global {
  namespace GraphileBuild {
    interface Inflection {
      gisType(
        this: Inflection,
        typeName: string,
        subtype: Subtype,
        hasZ: boolean,
        hasM: boolean
      ): string;
      gisInterfaceName(this: Inflection, typeName: string): string;
      gisDimensionInterfaceName(
        this: Inflection,
        typeName: string,
        hasZ: boolean,
        hasM: boolean
      ): string;
      geojsonFieldName(this: Inflection): string;
      gisXFieldName(this: Inflection, typeName: string): string;
      gisYFieldName(this: Inflection, typeName: string): string;
      gisZFieldName(this: Inflection, typeName: string): string;
    }
  }
}

export const PostgisInflectionPlugin: GraphileConfig.Plugin = {
  name: "PostgisInflectionPlugin",
  version,

  inflection: {
    add: {
      gisType(
        _preset,
        typeName: string,
        subtype: Subtype,
        hasZ: boolean,
        hasM: boolean
      ) {
        return this.upperCamelCase(
          [
            typeName,
            SUBTYPE_STRING_BY_SUBTYPE[subtype],
            hasZ ? "z" : null,
            hasM ? "m" : null,
          ]
            .filter((_) => _)
            .join("-")
        );
      },
      gisInterfaceName(_preset, typeName: string) {
        return this.upperCamelCase(`${typeName}-interface`);
      },
      gisDimensionInterfaceName(
        _preset,
        typeName: string,
        hasZ: boolean,
        hasM: boolean
      ) {
        return this.upperCamelCase(
          [
            typeName,
            SUBTYPE_STRING_BY_SUBTYPE[0],
            hasZ ? "z" : null,
            hasM ? "m" : null,
          ]
            .filter((_) => _)
            .join("-")
        );
      },
      geojsonFieldName() {
        return `geojson`;
      },
      gisXFieldName(_preset, typeName: string) {
        return typeName === "geography" ? "longitude" : "x";
      },
      gisYFieldName(_preset, typeName: string) {
        return typeName === "geography" ? "latitude" : "y";
      },
      gisZFieldName(_preset, typeName: string) {
        return typeName === "geography" ? "height" : "z";
      },
    },
  },
};

export default PostgisInflectionPlugin;
