import * as fs from "fs";
import * as path from "path";
import { ExtensionContext } from "vscode";
import { recentNum } from "./configs";

const STORAGE_FILE = "easy-project-manager.json";

export interface ProjectItem {
  label: string;
  dir: string;
}

export interface ProjectManagerData {
  recent: ProjectItem[];
  project: ProjectItem[];
}

function getStorageFilePath(context: ExtensionContext) {
  // AppData\Roaming\Code - Insiders\User\globalStorage\cnsmaple.easy-project-manager
  return path.join(context.globalStorageUri.fsPath, STORAGE_FILE);
}

export function readProjectManagerData(
  context: ExtensionContext
): ProjectManagerData {
  const filePath = getStorageFilePath(context);
  if (!fs.existsSync(filePath)) {
    return { recent: [], project: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { recent: [], project: [] };
  }
}

export function writeProjectManagerData(
  context: ExtensionContext,
  data: ProjectManagerData
) {
  const filePath = getStorageFilePath(context);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function addRecent(context: ExtensionContext, project: ProjectItem) {
  const data = readProjectManagerData(context);
  const idx = data.recent.findIndex((p) => p.dir === project.dir);
  if (idx >= 0) {
    // 已存在，先移除
    data.recent.splice(idx, 1);
  }
  // 插入到最前面
  data.recent.unshift(project);
  const maxRecent = Number(recentNum.value);
  if (data.recent.length > maxRecent) {
    data.recent = data.recent.slice(0, maxRecent);
  }
  writeProjectManagerData(context, data);
}

export function addProject(context: ExtensionContext, project: ProjectItem) {
  const data = readProjectManagerData(context);
  const idx = data.project.findIndex((p) => p.dir === project.dir);
  if (idx >= 0) {
    data.project[idx] = project;
  } else {
    data.project.push(project);
  }
  writeProjectManagerData(context, data);
}

export function removeProject(context: ExtensionContext, dir: string) {
  const data = readProjectManagerData(context);
  data.project = data.project.filter((p) => p.dir !== dir);
  writeProjectManagerData(context, data);
}

/**
 * 获取当前工作区目录（第一个工作区文件夹路径），没有则返回空字符串
 */
export function getCurrentWorkspaceDir(): string {
  // 这里不能直接import vscode，只能用require
  const vscode = require("vscode");
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? folder.uri.fsPath : "";
}

import { defineLogger } from "reactive-vscode";

export const logger = defineLogger("Project Manager");
