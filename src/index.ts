import {
  ICommandPalette,
} from "@jupyterlab/apputils";

import {
  IMainMenu
} from "@jupyterlab/mainmenu";

import {
  INotebookTracker,
} from "@jupyterlab/notebook";

import {
  CodeCell,
} from "@jupyterlab/cells";

import {
  ISettingRegistry, URLExt, PathExt,
} from "@jupyterlab/coreutils";

import {
  ServerConnection,
} from "@jupyterlab/services";

import {
  JupyterFrontEnd, JupyterFrontEndPlugin,
} from "@jupyterlab/application";

import {
  IEditorTracker,
} from '@jupyterlab/fileeditor';

import "../style/index.css";

const PLUGIN_NAME = "jupyterlab_code_formatter";

function request(
  path: string,
  method: string,
  body: any,
  settings: ServerConnection.ISettings,
): Promise<any> {
  const fullUrl = URLExt.join(settings.baseUrl, PLUGIN_NAME, path);

  return ServerConnection.makeRequest(fullUrl, { body, method }, settings).then((response) => {
    if (response.status !== 200) {
      return response.text().then((data) => {
        throw new ServerConnection.ResponseError(response, data);
      });
    }
    return response.text();
  });
}

class JupyterLabCodeFormatter {
  private app: JupyterFrontEnd;
  private tracker: INotebookTracker;
  private palette: ICommandPalette;
  private settingRegistry: ISettingRegistry;
  private menu: IMainMenu;
  private config: any;
  private editorTracker: IEditorTracker;

  private working = false;
  private pythonCommands = ["black", "yapf", "autopep8", "isort"].map(name=> `${PLUGIN_NAME}:${name}`);
  private rCommands = ["formatR", "styler"].map(name=> `${PLUGIN_NAME}:${name}`);

  constructor(
    app: JupyterFrontEnd, tracker: INotebookTracker,
    palette: ICommandPalette, settingRegistry: ISettingRegistry,
    menu: IMainMenu, editorTracker: IEditorTracker
  ) {
    this.app = app;
    this.tracker = tracker;
    this.editorTracker = editorTracker;
    this.palette = palette;
    this.settingRegistry = settingRegistry;
    this.menu = menu;
    this.setupSettings();
    // tslint:disable-next-line:no-console
    request("formatters", "GET", null, ServerConnection.defaultSettings).then(
      (data) => {
        const formatters = JSON.parse(data).formatters;
        let menuGroup: {command: string}[] = [];
        Object.keys(formatters).forEach(
          (formatter) => {
            if (formatters[formatter].enabled) {
              const command = `${PLUGIN_NAME}:${formatter}`;
              this.setupButton(formatter, formatters[formatter].label, command);
              menuGroup.push({ command });
            }
          },
        );
        this.menu.editMenu.addGroup(menuGroup);
      },
    );
  }

  private setupSettings() {
    const self = this;
    Promise.all([this.settingRegistry.load(`@ryantam626/${PLUGIN_NAME}:settings`)]).then(
      ([settings]) => {
        function onSettingsUpdated(jsettings: ISettingRegistry.ISettings) {
          self.config = jsettings.composite;
        }
        settings.changed.connect(onSettingsUpdated);
        onSettingsUpdated(settings);
      },
      // tslint:disable-next-line:no-console
    ).catch((reason: Error) => console.error(reason.message));
  }

  private maybeFormatCodecell(formatterName: string) {
    // TODO: Check current kernel is of appropriate kernel
    const editorWidget = this.editorTracker.currentWidget;
    if (this.working) {
      return;
    }
    if (editorWidget && editorWidget.content !== null &&  editorWidget.content.isVisible){
        this.working = true;
        const editor = editorWidget.content.editor;
        const code = editor.model.value.text;
        request(
          "format", "POST", JSON.stringify(
            {
              code: code,
              formatter: formatterName,
              options: this.config[formatterName],
            },
          ), ServerConnection.defaultSettings,
        ).then(
            (data) => {
              this.editorTracker.currentWidget.content.editor.model.value.text = JSON.parse(data);
              this.working = false;
            },
        ).catch(
          () => {
            this.working = false;
            // tslint:disable-next-line:no-console
            console.error("Something went wrong :(");
          },
        );    
    } else if (this.tracker.activeCell instanceof CodeCell) {
        this.working = true;
        request(
          "format", "POST", JSON.stringify(
            {
              code: this.tracker.activeCell.model.value.text,
              formatter: formatterName,
              options: this.config[formatterName],
            },
          ), ServerConnection.defaultSettings,
        ).then(
            (data) => {
              this.tracker.activeCell.model.value.text = JSON.parse(data);
              this.working = false;
            },
        ).catch(
          () => {
            this.working = false;
            // tslint:disable-next-line:no-console
            console.error("Something went wrong :(");
          },
        );
      }
  }

  private setupButton(name: string, label: string, command: string) {
    this.app.commands.addCommand(command, {
      execute: () => {
        this.maybeFormatCodecell(name);
      },
      isVisible: () => {
        let widget = this.app.shell.currentWidget;
        // TODO: handle other languages other than Python
        let editorWidget = this.editorTracker.currentWidget;
        let notebookWidget = this.tracker.currentWidget;

        return widget && (
          (this.pythonCommands.some(cmd=> cmd===command) && editorWidget && widget === editorWidget &&
              PathExt.extname(editorWidget.context.path).toLowerCase() === '.py') ||
          (this.rCommands.some(cmd=> cmd===command) && editorWidget && widget === editorWidget &&
              PathExt.extname(editorWidget.context.path).toLowerCase() === '.r') ||
          (notebookWidget && widget === notebookWidget)
        );
      },
      label,
    });
    this.palette.addItem({ command, category: "JupyterLab Code Formatter" });
  }

}

/**
 * Initialization data for the jupyterlab_code_formatter extension.
 */
const extension: JupyterFrontEndPlugin<void> = {
  activate: (
    app: JupyterFrontEnd, palette: ICommandPalette,
    tracker: INotebookTracker, settingRegistry: ISettingRegistry,
    menu: IMainMenu, editorTracker: IEditorTracker
  ) => {
    // tslint:disable-next-line:no-unused-expression
    new JupyterLabCodeFormatter(app, tracker, palette, settingRegistry, menu, editorTracker);
  },
  autoStart: true,
  id: PLUGIN_NAME,
  requires: [ICommandPalette, INotebookTracker, ISettingRegistry, IMainMenu, IEditorTracker],
};

export default extension;
