import packageJson from "../package.json";

type SDK = {
  version: string;
};

export default {
  version: packageJson.version
} as SDK;
