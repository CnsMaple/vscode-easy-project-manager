import { defineConfigs } from "reactive-vscode";

export const { recentNum, alwaysShowStartPage } = defineConfigs(
  "easy-project-manager",
  {
    recentNum: "number",
    alwaysShowStartPage: "boolean",
  }
);
