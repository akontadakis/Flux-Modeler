// scripts/energyplusSidebar.js
import { getDom, setupDOM } from './dom.js';
import { handleInputChange } from './ui.js';
import { initializePanelControls } from './ui.js';
import { project } from './project.js';
import { resultsManager } from './resultsManager.js';
import { validateEnergyPlusRunRequest, formatIssuesSummary } from './energyplusValidation.js';
import { openSchedulesManagerPanel } from './energyplusSchedules.js';
import { openMaterialsManagerPanel, openConstructionsManagerPanel } from './energyplusMaterials.js';
import { openThermostatsPanel } from './energyplusThermostats.js';
import {
    getConfig,
    setPeople,
    setLights,
    setElectricEquipment,
    setGasEquipment,
    setHotWaterEquipment,
    setSteamEquipment,
    setOtherEquipment
} from './energyplusConfigService.js';
/* EnergyPlus contextual help disabled */

let dom;

const recipes = {
    "Annual Energy Simulation": {
        description: "Runs a full annual energy simulation using EnergyPlus.",
        id: "annual-energy-simulation",
        scriptName: "run-energyplus.sh",
        params: [
            { id: "idf-file", name: "IDF File (optional, defaults to generated model.idf)", type: "file", accept: ".idf" },
            { id: "epw-file", name: "EPW File (optional, uses project-level EPW if omitted)", type: "file", accept: ".epw" },
            { id: "eplus-exe", name: "EnergyPlus Executable Path", type: "text" }
        ]
    },
    "Heating Design Day": {
        description: "Runs a sizing-only simulation using design day periods defined in the IDF (heating-focused).",
        id: "heating-design-day",
        scriptName: "run-heating-design.sh",
        params: [
            { id: "idf-file", name: "IDF File (optional, defaults to model.idf)", type: "file", accept: ".idf" },
            { id: "epw-file", name: "EPW File (optional, uses project-level EPW if omitted)", type: "file", accept: ".epw" },
            { id: "eplus-exe", name: "EnergyPlus Executable Path", type: "text" }
        ]
    },
    "Cooling Design Day": {
        description: "Runs a sizing-only simulation using design day periods defined in the IDF (cooling-focused).",
        id: "cooling-design-day",
        scriptName: "run-cooling-design.sh",
        params: [
            { id: "idf-file", name: "IDF File (optional, defaults to model.idf)", type: "file", accept: ".idf" },
            { id: "epw-file", name: "EPW File (optional, uses project-level EPW if omitted)", type: "file", accept: ".epw" },
            { id: "eplus-exe", name: "EnergyPlus Executable Path", type: "text" }
        ]
    }
};

function initializeEnergyPlusSidebar() {
    dom = getDom();

    // --- 1. Simulation Checklist Panel ---
    // Moved to energyplusSimulationChecklist.js


    // --- 2. Run Simulation Panel ---
    const runPanel = dom['panel-run'] || document.getElementById('panel-run');
    if (runPanel) {
        let content = runPanel.querySelector('.window-content');
        if (!content) {
            content = document.createElement('div');
            content.className = 'window-content';
            runPanel.appendChild(content);
        }
        content.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; overflow: hidden;">
                <div style="display: flex; flex: 1; overflow: hidden;">
                    <!-- Left Sidebar: Recipe List -->
                    <div style="width: 200px; border-right: 1px solid var(--grid-color); display: flex; flex-direction: column;">
                        <div style="padding: 0.5rem; border-bottom: 1px solid var(--grid-color);">
                            <span class="label">Simulation Recipes</span>
                        </div>
                        <div id="recipe-sidebar-list" class="scrollable-panel-inner" style="flex: 1; overflow-y: auto;">
                            <!-- Recipe items will be inserted here -->
                        </div>
                    </div>

                    <!-- Right Content: Recipe Editor -->
                    <div id="recipe-content" style="flex: 1; padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
                        <div class="text-[--text-secondary] text-sm text-center mt-10">Select a recipe to configure.</div>
                    </div>
                </div>
            </div>
        `;
        populateRecipeList();
    }

    // Ensure Shading Panel is created on startup (hidden) so DOM elements exist for geometry.js
    const shadingPanel = document.getElementById('panel-energyplus-shading');
    if (!shadingPanel) {
        const panel = createShadingManagerPanel();
        document.getElementById('window-container').appendChild(panel);
    }
}

/**
 * SIMULATION CHECKLIST
 * Provides a guided 1→7 workflow status derived from current project metadata and diagnostics.
 */



function populateRecipeList() {
    const sidebarList = dom['panel-run']?.querySelector('#recipe-sidebar-list');
    if (!sidebarList) return;

    sidebarList.innerHTML = '';

    for (const name in recipes) {
        const recipe = recipes[name];
        const item = document.createElement('div');
        item.className = 'tstat-item';
        item.style.cssText = 'padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--grid-color);';
        item.dataset.recipeName = name;
        item.innerHTML = `<div class="text-xs">${name}</div>`;

        // Hover effects
        item.addEventListener('mouseenter', () => {
            if (!item.classList.contains('active')) {
                item.style.backgroundColor = 'var(--hover-bg)';
            }
        });
        item.addEventListener('mouseleave', () => {
            if (!item.classList.contains('active')) {
                item.style.backgroundColor = '';
            }
        });

        // Click handler
        item.addEventListener('click', () => {
            // Reset all items
            sidebarList.querySelectorAll('.tstat-item').forEach(el => {
                el.classList.remove('active');
                el.style.backgroundColor = '';
                el.style.color = '';
            });

            // Set active state
            item.classList.add('active');
            item.style.backgroundColor = 'var(--accent-color)';
            item.style.color = 'white';

            // Render content
            if (recipe.isDiagnostics) {
                openDiagnosticsPanel();
            } else {
                renderRecipeContent(recipe, name);
            }
        });

        sidebarList.appendChild(item);
    }

    // Add Configuration Section
    const configHeader = document.createElement('div');
    configHeader.style.cssText = 'padding: 0.5rem; border-bottom: 1px solid var(--grid-color); margin-top: 1rem;';
    configHeader.innerHTML = '<span class="label">Configuration</span>';
    sidebarList.appendChild(configHeader);

    const outputsItem = document.createElement('div');
    outputsItem.className = 'tstat-item';
    outputsItem.style.cssText = 'padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--grid-color);';
    outputsItem.dataset.section = 'outputs';
    outputsItem.innerHTML = '<div class="text-xs">Outputs</div>';

    outputsItem.addEventListener('mouseenter', () => {
        if (!outputsItem.classList.contains('active')) outputsItem.style.backgroundColor = 'var(--hover-bg)';
    });
    outputsItem.addEventListener('mouseleave', () => {
        if (!outputsItem.classList.contains('active')) outputsItem.style.backgroundColor = '';
    });

    outputsItem.addEventListener('click', () => {
        sidebarList.querySelectorAll('.tstat-item').forEach(el => {
            el.classList.remove('active');
            el.style.backgroundColor = '';
            el.style.color = '';
        });
        outputsItem.classList.add('active');
        outputsItem.style.backgroundColor = 'var(--accent-color)';
        outputsItem.style.color = 'white';
        renderOutputsContent();
    });

    sidebarList.appendChild(outputsItem);
}

function renderRecipeContent(recipe, name) {
    const contentArea = dom['panel-run']?.querySelector('#recipe-content');
    if (!contentArea) return;

    const isAnnual = recipe.id === 'annual-energy-simulation';
    const isHeating = recipe.id === 'heating-design-day';
    const isCooling = recipe.id === 'cooling-design-day';

    function getProjectEpwPath() {
        try {
            const meta = (typeof project.getMetadata === 'function' && project.getMetadata()) || project.metadata || {};
            const ep = meta.energyPlusConfig || meta.energyplus || {};
            const weather = ep.weather || {};
            return weather.epwPath || ep.weatherFilePath || null;
        } catch (e) {
            console.warn('EnergyPlus: failed to read project-level EPW', e);
            return null;
        }
    }

    function getRunName() {
        if (isAnnual) return 'annual';
        if (isHeating) return 'heating-design';
        if (isCooling) return 'cooling-design';
        return recipe.id || 'custom';
    }

    let paramsHtml = '';
    recipe.params.forEach((param) => {
        paramsHtml += `
            <div>
                <label class="label">${param.name}</label>
                <input type="${param.type}" id="${param.id}" ${param.accept ? `accept="${param.accept}"` : ''} class="w-full mt-1">
            </div>
        `;
    });

    contentArea.innerHTML = `
        <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">
            ${name}
        </h3>
        
        <p class="text-xs text-[--text-secondary]">${recipe.description}</p>
        
        ${isAnnual ? `
        <div class="p-2 border border-[--grid-color] rounded bg-black/20">
            <button class="btn btn-sm btn-secondary w-full" data-action="generate-idf-from-project">
                Generate IDF from Project
            </button>
            <p class="text-xs text-[--text-secondary] mt-1">
                Writes <code>model.idf</code> based on current configuration.
            </p>
        </div>
        ` : ''}

        <div class="space-y-4">
            <h4 class="font-semibold text-xs uppercase text-[--text-secondary]">Simulation Parameters</h4>
            ${paramsHtml}
            
            ${isAnnual ? `
            <div class="text-xs text-[--text-secondary]">
                Project EPW: <span data-role="project-epw-label" class="text-[--accent-color]">(resolving...)</span>
            </div>
            ` : ''}
            
            ${isHeating || isCooling ? `
            <p class="text-xs text-[--text-secondary]">
                Reuses selected IDF (or <code>model.idf</code>). Ensure <code>SimulationControl</code> and <code>SizingPeriod</code> are set.
                Runs in <code>runs/${isHeating ? 'heating-design' : 'cooling-design'}</code>.
            </p>
            ` : ''}
        </div>

        <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
            <button class="btn btn-sm btn-primary" data-action="run">Run Simulation</button>
        </div>
        
        <div class="mt-2">
             <h5 class="font-semibold text-xs uppercase text-[--text-secondary] mb-1">Output Console</h5>
             <pre class="simulation-output-console w-full h-32 font-mono text-xs p-2 rounded bg-[--grid-color] border border-gray-500/50 overflow-y-auto whitespace-pre-wrap"></pre>
        </div>
    `;

    // Update EPW label
    if (isAnnual) {
        const projectEpwLabel = contentArea.querySelector('[data-role="project-epw-label"]');
        if (projectEpwLabel) {
            const epw = getProjectEpwPath();
            projectEpwLabel.textContent = epw || '(not set)';
        }
    }

    // Wire up generate button
    const generateBtn = contentArea.querySelector('[data-action="generate-idf-from-project"]');
    if (generateBtn) {
        generateBtn.addEventListener('click', async () => {
            const outputConsole = contentArea.querySelector('.simulation-output-console');
            try {
                const { generateAndStoreIdf } = await import('./energyplus.js');
                await generateAndStoreIdf();
                if (outputConsole) {
                    outputConsole.textContent = 'IDF generated and stored as model.idf\n';
                }
            } catch (err) {
                console.error('EnergyPlus: failed to generate IDF from project', err);
                if (outputConsole) {
                    outputConsole.textContent += `Error generating IDF: ${err.message}\n`;
                }
                alert('Failed to generate IDF from project. Check console for details.');
            }
        });
    }

    // Wire up run button
    const runBtn = contentArea.querySelector('[data-action="run"]');
    if (runBtn) {
        let epOutputListener = null;
        let epExitListener = null;

        runBtn.addEventListener('click', () => {
            const outputConsole = contentArea.querySelector('.simulation-output-console');

            if (!window.electronAPI) {
                if (outputConsole) {
                    outputConsole.textContent += 'Electron environment not detected. Please run via Electron or use the generated IDF/scripts.\n';
                }
                alert('EnergyPlus can only be run directly inside the Electron app. In browser, use the generated IDF/scripts manually.');
                return;
            }

            const idfInput = contentArea.querySelector('#idf-file');
            const epwInput = contentArea.querySelector('#epw-file');
            const exeInput = contentArea.querySelector('#eplus-exe');

            const idfPath = idfInput && idfInput.files && idfInput.files[0] ? idfInput.files[0].path || idfInput.files[0].name : 'model.idf';

            const explicitEpw = epwInput && epwInput.files && epwInput.files[0] ? epwInput.files[0].path || epwInput.files[0].name : null;
            const projectEpw = getProjectEpwPath();
            const epwPath = explicitEpw || projectEpw || null;

            const energyPlusPath = exeInput && exeInput.value ? exeInput.value.trim() : null;

            if (!epwPath) {
                alert('No EPW specified. Select an EPW here or configure a project-level EPW in the "Weather & Location" panel.');
                return;
            }

            if (!energyPlusPath) {
                alert('Specify the EnergyPlus executable path.');
                return;
            }

            const runName = getRunName();
            const runId = `${runName}-${Date.now()}`;

            const preRun = validateEnergyPlusRunRequest({
                idfPath,
                epwPath,
                energyPlusPath,
                recipeId: recipe.id,
            });

            if (!preRun.ok) {
                const summary = formatIssuesSummary(preRun.issues, 4);
                if (outputConsole) {
                    outputConsole.textContent += 'Pre-run validation failed:\n' + (summary || 'Blocking configuration issues detected.') + '\n\n';
                    outputConsole.scrollTop = outputConsole.scrollHeight;
                }
                alert('Cannot start EnergyPlus run due to configuration issues.\n\n' + (summary || 'Check the EnergyPlus sidebar configuration and diagnostics.'));
                return;
            }

            resultsManager.registerEnergyPlusRun(runId, {
                label: `EnergyPlus ${runName}`,
                recipeId: recipe.id,
            });

            if (outputConsole) {
                outputConsole.textContent = `Running EnergyPlus [${runName}]...\nIDF: ${idfPath}\nEPW: ${epwPath}\nExe: ${energyPlusPath}\nOutputs: runs/${runName}/ (if supported by Electron bridge)\n\n`;
            }

            if (window.electronAPI.offEnergyPlusOutput && epOutputListener) {
                window.electronAPI.offEnergyPlusOutput(epOutputListener);
                epOutputListener = null;
            }
            if (window.electronAPI.offEnergyPlusExit && epExitListener) {
                window.electronAPI.offEnergyPlusExit(epExitListener);
                epExitListener = null;
            }

            const runOptions = {
                idfPath,
                epwPath,
                energyPlusPath,
                runName,
                runId,
            };

            window.electronAPI.runEnergyPlus(runOptions);

            const handleOutput = (payload) => {
                if (!outputConsole) return;
                let text = '';
                if (payload && typeof payload === 'object' && typeof payload.chunk === 'string') {
                    if (payload.runId && payload.runId !== runId) return;
                    text = payload.chunk;
                } else {
                    text = String(payload ?? '');
                }
                if (!text) return;
                outputConsole.textContent += text;
                outputConsole.scrollTop = outputConsole.scrollHeight;
            };

            const handleExit = (payload) => {
                if (payload && typeof payload === 'object' && payload.runId && payload.runId !== runId) return;

                const code = typeof payload === 'object' && payload !== null ? (typeof payload.exitCode === 'number' ? payload.exitCode : 0) : (typeof payload === 'number' ? payload : 0);
                const resolvedRunId = (payload && typeof payload === 'object' && payload.runId) || runId;
                const baseDir = payload && typeof payload === 'object' ? payload.outputDir : undefined;
                const errContent = payload && typeof payload === 'object' ? payload.errContent : undefined;
                const csvContents = payload && typeof payload === 'object' ? payload.csvContents : undefined;

                const runRecord = resultsManager.parseEnergyPlusResults(resolvedRunId, {
                    baseDir,
                    errContent,
                    csvContents,
                    statusFromRunner: code,
                });

                if (outputConsole) {
                    outputConsole.textContent += `\n--- EnergyPlus exited with code: ${code} ---\n`;
                    if (runRecord && runRecord.errors) {
                        const { fatal, severe, warning } = runRecord.errors;
                        const lines = [];
                        if (fatal.length) {
                            lines.push(`Fatal errors: ${fatal.length}`);
                            lines.push(fatal[0]);
                        }
                        if (severe.length) {
                            lines.push(`Severe errors: ${severe.length}`);
                            if (!fatal.length) lines.push(severe[0]);
                        }
                        if (warning.length) lines.push(`Warnings: ${warning.length}`);
                        if (lines.length) outputConsole.textContent += lines.join('\n') + '\n';
                    }
                    outputConsole.scrollTop = outputConsole.scrollHeight;
                }

                if (window.electronAPI.offEnergyPlusOutput && epOutputListener) {
                    window.electronAPI.offEnergyPlusOutput(epOutputListener);
                    epOutputListener = null;
                }
                if (window.electronAPI.offEnergyPlusExit && epExitListener) {
                    window.electronAPI.offEnergyPlusExit(epExitListener);
                    epExitListener = null;
                }
            };

            if (window.electronAPI.onEnergyPlusOutput) {
                epOutputListener = window.electronAPI.onEnergyPlusOutput(handleOutput);
            }
            if (window.electronAPI.onceEnergyPlusExit) {
                epExitListener = window.electronAPI.onceEnergyPlusExit(handleExit);
            } else if (window.electronAPI.onEnergyPlusExit) {
                epExitListener = window.electronAPI.onEnergyPlusExit(handleExit);
            }
        });
    }
}

function renderOutputsContent() {
    const contentArea = dom['panel-run']?.querySelector('#recipe-content');
    if (!contentArea) return;

    contentArea.innerHTML = `
        <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">
            Output Variables
        </h3>
        
        <p class="text-xs text-[--text-secondary] mb-4">
            Configure <code>Output:Variable</code> entries.
            Settings are stored in <code>energyPlusConfig.daylighting.outputs.variables</code>.
        </p>

        <div class="flex justify-between items-center mb-2">
            <span class="font-semibold text-xs uppercase text-[--text-secondary]">Variables List</span>
            <button class="btn btn-xxs btn-secondary" data-action="add-output-var">+ Add Variable</button>
        </div>

        <div class="border border-gray-700/70 rounded bg-black/40 max-h-96 overflow-y-auto scrollable-panel-inner mb-2">
            <table class="w-full text-xs">
                <thead class="bg-black/40 sticky top-0">
                    <tr>
                        <th class="px-2 py-1 text-left">Key</th>
                        <th class="px-2 py-1 text-left">Variable Name</th>
                        <th class="px-2 py-1 text-left">Frequency</th>
                        <th class="px-2 py-1 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody class="outputs-vars-tbody"></tbody>
            </table>
        </div>

        <div class="text-xs text-[--text-secondary] mb-4">
            Examples: Key = zone name or "Environment"; Variable = "Zone Lights Electric Power"; Frequency = Hourly/RunPeriod/etc.
        </div>

        <div class="flex justify-end gap-2 pt-4 border-t border-[--grid-color]">
            <button class="btn btn-sm btn-primary" data-action="save-outputs">Save Outputs</button>
        </div>
    `;

    const tbody = contentArea.querySelector('.outputs-vars-tbody');
    const addBtn = contentArea.querySelector('[data-action="add-output-var"]');
    const saveBtn = contentArea.querySelector('[data-action="save-outputs"]');

    function getState() {
        const meta = (typeof project.getMetadata === 'function' && project.getMetadata()) || project.metadata || {};
        const ep = meta.energyPlusConfig || meta.energyplus || {};
        const daylighting = ep.daylighting || {};
        const outputs = daylighting.outputs || {};
        const vars = Array.isArray(outputs.variables) ? outputs.variables.slice() : [];
        return { meta, ep, daylighting, vars };
    }

    function render() {
        const { vars } = getState();
        tbody.innerHTML = '';

        if (!vars.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-2 py-2 text-xs text-[--text-secondary] italic text-center" colspan="4">
                    No Output:Variable entries defined.
                </td>
            `;
            tbody.appendChild(tr);
            return;
        }

        vars.forEach((v, index) => {
            const tr = document.createElement('tr');
            tr.dataset.index = String(index);
            tr.className = 'border-b border-white/5 last:border-0';
            tr.innerHTML = `
                <td class="px-2 py-1 align-top">
                    <input class="w-full text-xs bg-transparent border-none focus:ring-0 p-0" data-field="key" value="${v.key || ''}" placeholder="*">
                </td>
                <td class="px-2 py-1 align-top">
                    <input class="w-full text-xs bg-transparent border-none focus:ring-0 p-0" data-field="variableName" value="${v.variableName || ''}" placeholder="Variable Name">
                </td>
                <td class="px-2 py-1 align-top">
                    <select class="w-full text-xs bg-transparent border-none focus:ring-0 p-0" data-field="freq">
                        ${['Timestep', 'Hourly', 'Daily', 'Monthly', 'RunPeriod'].map((f) => `
                            <option value="${f}"${(v.reportingFrequency || 'Hourly') === f ? ' selected' : ''}>${f}</option>
                        `).join('')}
                    </select>
                </td>
                <td class="px-2 py-1 align-top text-right">
                    <button class="text-red-400 hover:text-red-300" data-action="delete-var">×</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('button[data-action="delete-var"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('tr');
                if (row) row.remove();
            });
        });
    }

    function addRow() {
        // Clear "No entries" message if present
        if (tbody.querySelector('td[colspan="4"]')) {
            tbody.innerHTML = '';
        }

        const tr = document.createElement('tr');
        tr.className = 'border-b border-white/5 last:border-0';
        tr.innerHTML = `
            <td class="px-2 py-1 align-top">
                <input class="w-full text-xs bg-transparent border-none focus:ring-0 p-0" data-field="key" placeholder="Key (zone name, Environment, *)">
            </td>
            <td class="px-2 py-1 align-top">
                <input class="w-full text-xs bg-transparent border-none focus:ring-0 p-0" data-field="variableName" placeholder="Variable Name">
            </td>
            <td class="px-2 py-1 align-top">
                <select class="w-full text-xs bg-transparent border-none focus:ring-0 p-0" data-field="freq">
                    <option value="Hourly" selected>Hourly</option>
                    <option value="Timestep">Timestep</option>
                    <option value="Daily">Daily</option>
                    <option value="Monthly">Monthly</option>
                    <option value="RunPeriod">RunPeriod</option>
                </select>
            </td>
            <td class="px-2 py-1 align-top text-right">
                <button class="text-red-400 hover:text-red-300" data-action="delete-var">×</button>
            </td>
        `;
        tbody.appendChild(tr);
        tr.querySelector('[data-action="delete-var"]').addEventListener('click', () => {
            tr.remove();
            if (tbody.children.length === 0) render(); // Show empty message again
        });
    }

    addBtn.addEventListener('click', addRow);

    saveBtn.addEventListener('click', async () => {
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const newVars = [];
        rows.forEach((tr) => {
            if (tr.querySelector('td[colspan="4"]')) return; // Skip empty message

            const key = tr.querySelector('[data-field="key"]')?.value.trim();
            const variableName = tr.querySelector('[data-field="variableName"]')?.value.trim();
            const freq = tr.querySelector('[data-field="freq"]')?.value;

            if (key && variableName) {
                newVars.push({
                    key,
                    variableName,
                    reportingFrequency: freq,
                });
            }
        });

        const { meta, ep, daylighting } = getState();

        // Ensure structure exists
        if (!meta.energyPlusConfig) meta.energyPlusConfig = {};
        if (!meta.energyPlusConfig.daylighting) meta.energyPlusConfig.daylighting = {};
        if (!meta.energyPlusConfig.daylighting.outputs) meta.energyPlusConfig.daylighting.outputs = {};

        meta.energyPlusConfig.daylighting.outputs.variables = newVars;

        try {
            if (typeof project.updateMetadata === 'function') {
                await project.updateMetadata(meta);
            } else {
                project.metadata = meta;
                // Fallback save if updateMetadata not available
                if (typeof project.save === 'function') await project.save();
            }
            alert('Outputs configuration saved.');
        } catch (err) {
            console.error('Failed to save outputs:', err);
            alert('Failed to save outputs.');
        }
    });

    render();
}

function openRecipePanel(recipe) {
    const panelId = `panel - ${recipe.id} `;
    let panel = document.getElementById(panelId);

    // Force recreation to show updated layout
    if (panel) {
        panel.remove();
        panel = null;
    }

    if (!panel) {
        panel = createRecipePanel(recipe);
        document.getElementById('window-container').appendChild(panel);
    }
    panel.classList.remove('hidden');
    panel.style.zIndex = getNewZIndex();
}

async function openDiagnosticsPanel() {
    const panelId = 'panel-energyplus-diagnostics';
    let panel = document.getElementById(panelId);

    // Force recreate if old style
    if (panel && !panel.querySelector('[data-role="diagnostics-body"]')) {
        panel.remove();
        panel = null;
    }

    if (!panel) {
        panel = createDiagnosticsPanel();
        document.getElementById('window-container').appendChild(panel);
        initializePanelControls(panel);
    }

    panel.classList.remove('hidden');
    panel.style.zIndex = getNewZIndex();
    await refreshDiagnosticsPanel(panel);
}

function createDiagnosticsPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-energyplus-diagnostics';
    panel.className = 'floating-window ui-panel resizable-panel';
    panel.style.width = '600px';
    panel.style.height = '500px';

    panel.innerHTML = `
        <div class="window-header">
            <span>EnergyPlus IDF Preview / Diagnostics</span>
            <div class="window-controls">
                <div class="window-icon-max" title="Maximize/Restore"></div>
                <div class="collapse-icon" title="Minimize"></div>
                <div class="window-icon-close" title="Close"></div>
            </div>
        </div>
    <div class="window-content" style="display: flex; flex-direction: column; height: 100%; overflow: hidden;">
        <div class="resize-handle-edge top"></div>
        <div class="resize-handle-edge right"></div>
        <div class="resize-handle-edge bottom"></div>
        <div class="resize-handle-edge left"></div>
        <div class="resize-handle-corner top-left"></div>
        <div class="resize-handle-corner top-right"></div>
        <div class="resize-handle-corner bottom-left"></div>
        <div class="resize-handle-corner bottom-right"></div>

        <div class="p-4 border-b border-[--grid-color] bg-black/20">
            <p class="text-xs text-[--text-secondary] mb-3 leading-relaxed">
                Preview how the current project maps to EnergyPlus objects. This view does not modify your project.
            </p>
            <div class="flex justify-between items-center">
                <span class="text-xs font-bold uppercase tracking-wider text-[--text-secondary]">Diagnostics Summary</span>
                <button class="btn btn-xs btn-secondary" data-action="refresh-diagnostics">
                    Refresh Report
                </button>
            </div>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-4" data-role="diagnostics-body">
            <div class="text-xs text-[--text-secondary]">
                Loading diagnostics...
            </div>
        </div>
    </div>
`;

    // Initialize controls AFTER adding to DOM (handled by caller or here if already attached)
    // But standard pattern is caller appends then inits. 
    // However, since this is called by openDiagnosticsPanel which appends it, we can't init here easily unless we wait.
    // Better to init in openDiagnosticsPanel or use the MutationObserver in ui.js if it works.
    // For safety, we'll add a method to init it.

    const refreshBtn = panel.querySelector('[data-action="refresh-diagnostics"]');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            await refreshDiagnosticsPanel(panel);
        });
    }

    return panel;
}

async function refreshDiagnosticsPanel(panel) {
    const body = panel.querySelector('[data-role="diagnostics-body"]');
    if (!body) return;

    body.innerHTML = `
        <div class="text-xs text-[--text-secondary]">
            Gathering diagnostics from current project...
        </div>
    `;

    try {
        const { generateEnergyPlusDiagnostics } = await import('./energyplus.js');
        const diagnostics = await generateEnergyPlusDiagnostics();

        renderDiagnostics(body, diagnostics);
    } catch (err) {
        console.error('EnergyPlus Diagnostics: failed to load diagnostics', err);
        body.innerHTML = `
            <div style="font-size:0.8rem; color:var(--status-error);">
                Failed to compute diagnostics. Check console for details.
            </div>
        `;
    }
}

function renderDiagnostics(container, diagnostics) {
    if (!diagnostics) {
        container.innerHTML = `
            <div class="text-xs text-red-400">
                No diagnostics data returned.
            </div>
        `;
        return;
    }

    const { geometry, constructions, materials, schedulesAndLoads, issues } = diagnostics;

    const hasErrors = (issues || []).some((i) => i.severity === 'error');
    const hasWarnings = (issues || []).some((i) => i.severity === 'warning');

    // Helper for cards
    const card = (title, content, statusColor = 'border-white/10') => `
        <div class="bg-white/5 rounded border ${statusColor} overflow-hidden">
            <div class="bg-black/20 px-3 py-2 border-b border-white/5 flex justify-between items-center">
                <h3 class="text-xs font-bold uppercase text-[--text-primary]">${title}</h3>
            </div>
            <div class="p-3">
                ${content}
            </div>
        </div>
    `;

    // 1. Issues Section
    let issuesHtml = '';
    if (issues && issues.length > 0) {
        const items = issues.map(i => `
            <div class="flex items-start gap-2 text-xs mb-2 last:mb-0">
                <div class="mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${i.severity === 'error' ? 'bg-red-500' : 'bg-amber-500'}"></div>
                <span class="text-[--text-secondary]">${i.message}</span>
            </div>
        `).join('');
        issuesHtml = card('Issues & Warnings', items, hasErrors ? 'border-red-500/30' : 'border-amber-500/30');
    } else {
        issuesHtml = card('Status', '<div class="text-xs text-emerald-400 flex items-center gap-2"><div class="w-2 h-2 rounded-full bg-emerald-500"></div>No critical issues detected.</div>', 'border-emerald-500/30');
    }

    // 2. Geometry Section
    const zonesList = (geometry?.zones || []).map(z => `
        <div class="flex justify-between text-xs py-1 border-b border-white/5 last:border-0">
            <span>${z.name}</span>
            <span class="text-[--text-secondary]">${z.surfaces?.total || 0}srf / ${z.windows?.total || 0}win</span>
        </div>
    `).join('') || '<div class="text-xs text-[--text-secondary] italic">No zones detected.</div>';

    const geometryHtml = card('Geometry', zonesList);

    // 3. Constructions & Materials
    const missingCons = constructions?.missingConstructions || [];
    const missingMats = materials?.missingMaterials || [];

    let constContent = '';
    if (missingCons.length > 0 || missingMats.length > 0) {
        constContent = `
            <div class="text-xs text-red-400 mb-2">Missing Definitions:</div>
            <ul class="list-disc pl-4 text-xs text-[--text-secondary] space-y-1">
                ${missingCons.map(c => `<li>Construction: ${c}</li>`).join('')}
                ${missingMats.map(m => `<li>Material: ${m}</li>`).join('')}
            </ul>
        `;
    } else {
        constContent = `<div class="text-xs text-[--text-secondary]">All referenced constructions and materials are defined.</div>`;
    }
    const constHtml = card('Constructions & Materials', constContent, (missingCons.length || missingMats.length) ? 'border-red-500/30' : 'border-white/10');

    // 4. Schedules & Loads
    const missingScheds = schedulesAndLoads?.missingSchedules || [];
    let schedContent = '';
    if (missingScheds.length > 0) {
        schedContent = `
            <div class="text-xs text-amber-400 mb-2">Missing Schedules:</div>
            <ul class="list-disc pl-4 text-xs text-[--text-secondary] space-y-1">
                ${missingScheds.map(s => `<li>${s}</li>`).join('')}
            </ul>
        `;
    } else {
        schedContent = `<div class="text-xs text-[--text-secondary]">All referenced schedules found.</div>`;
    }
    const schedHtml = card('Schedules & Loads', schedContent, missingScheds.length ? 'border-amber-500/30' : 'border-white/10');

    container.innerHTML = `
        <div class="space-y-4">
            ${issuesHtml}
            ${geometryHtml}
            ${constHtml}
            ${schedHtml}
        </div>
    `;
}

function createRecipePanel(recipe) {
    const panel = document.createElement('div');
    panel.id = `panel - ${recipe.id} `;
    panel.className = 'floating-window ui-panel resizable-panel';
    panel.dataset.scriptName = recipe.scriptName;
    panel.style.width = '600px';
    panel.style.height = '500px';

    let paramsHtml = '';
    recipe.params.forEach((param) => {
        paramsHtml += `
            <div>
                <label class="label">${param.name}</label>
                <input type="${param.type}" id="${param.id}" ${param.accept ? `accept="${param.accept}"` : ''} class="w-full mt-1">
            </div>
        `;
    });

    const isAnnual = recipe.id === 'annual-energy-simulation';
    const isHeating = recipe.id === 'heating-design-day';
    const isCooling = recipe.id === 'cooling-design-day';

    function getProjectEpwPath() {
        try {
            const meta =
                (typeof project.getMetadata === 'function' && project.getMetadata()) ||
                project.metadata ||
                {};
            const ep = meta.energyPlusConfig || meta.energyplus || {};
            const weather = ep.weather || {};
            return weather.epwPath || ep.weatherFilePath || null;
        } catch (e) {
            console.warn('EnergyPlus: failed to read project-level EPW', e);
            return null;
        }
    }

    function getRunName() {
        if (isAnnual) return 'annual';
        if (isHeating) return 'heating-design';
        if (isCooling) return 'cooling-design';
        return recipe.id || 'custom';
    }

    panel.innerHTML = `
        <div class="window-header">
            <span>${recipe.name || 'EnergyPlus Simulation'}</span>
            <div class="window-controls">
                <div class="window-icon-max" title="Maximize/Restore"></div>
                <div class="collapse-icon" title="Minimize"></div>
                <div class="window-icon-close" title="Close"></div>
            </div>
        </div>
        <div class="window-content" style="display: flex; flex-direction: column; height: 100%; overflow: hidden;">
            <div class="resize-handle-edge top"></div>
            <div class="resize-handle-edge right"></div>
            <div class="resize-handle-edge bottom"></div>
            <div class="resize-handle-edge left"></div>
            <div class="resize-handle-corner top-left"></div>
            <div class="resize-handle-corner top-right"></div>
            <div class="resize-handle-corner bottom-left"></div>
            <div class="resize-handle-corner bottom-right"></div>
            
            <div style="display: flex; flex: 1; overflow: hidden;">
                <!-- Left Sidebar -->
                <div style="width: 200px; border-right: 1px solid var(--grid-color); display: flex; flex-direction: column;">
                    <div style="padding: 0.5rem; border-bottom: 1px solid var(--grid-color);">
                        <span class="label">Configuration</span>
                    </div>
                    <div class="scrollable-panel-inner" style="flex: 1; overflow-y: auto;">
                        <div class="tstat-item active" style="padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--grid-color); background-color: var(--accent-color); color: white;">
                            <div class="text-xs">Settings</div>
                        </div>
                    </div>
                </div>

                <!-- Right Content -->
                <div style="flex: 1; padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
                    <p class="text-xs text-[--text-secondary]">${recipe.description}</p>
                    
                    ${isAnnual ? `
                    <div class="p-2 border border-[--grid-color] rounded bg-black/20">
                        <button class="btn btn-sm btn-secondary w-full" data-action="generate-idf-from-project">
                            Generate IDF from Project
                        </button>
                        <p class="text-xs text-[--text-secondary] mt-1">
                            Writes <code>model.idf</code> based on current configuration.
                        </p>
                    </div>
                    ` : ''}

                    <div class="space-y-4">
                        <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">
                            Simulation Parameters
                        </h3>
                        ${paramsHtml}
                        
                        ${isAnnual ? `
                        <div class="text-xs text-[--text-secondary]">
                            Project EPW: <span data-role="project-epw-label" class="text-[--accent-color]">(resolving...)</span>
                        </div>
                        ` : ''}
                        
                        ${isHeating || isCooling ? `
                        <p class="text-xs text-[--text-secondary]">
                            Reuses selected IDF (or <code>model.idf</code>). Ensure <code>SimulationControl</code> and <code>SizingPeriod</code> are set.
                            Runs in <code>runs/${isHeating ? 'heating-design' : 'cooling-design'}</code>.
                        </p>
                        ` : ''}
                    </div>

                    <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                        <button class="btn btn-sm btn-primary" data-action="run">Run Simulation</button>
                    </div>
                    
                    <div class="mt-2">
                         <h5 class="font-semibold text-xs uppercase text-[--text-secondary] mb-1">Output Console</h5>
                         <pre class="simulation-output-console w-full h-32 font-mono text-xs p-2 rounded bg-[--grid-color] border border-gray-500/50 overflow-y-auto whitespace-pre-wrap"></pre>
                    </div>
                </div>
            </div>
        </div>
    `;

    if (typeof window !== 'undefined' && window.initializePanelControls) {
        window.initializePanelControls(panel);
    } else {
        const closeButton = panel.querySelector('.window-icon-close');
        if (closeButton) {
            closeButton.onclick = () => panel.classList.add('hidden');
        }
    }

    const generateBtn = panel.querySelector('[data-action="generate-idf-from-project"]');
    const runBtn = panel.querySelector('[data-action="run"]');
    const outputConsole = panel.querySelector('.simulation-output-console');
    const projectEpwLabel = panel.querySelector('[data-role="project-epw-label"]');

    if (isAnnual && projectEpwLabel) {
        const epw = getProjectEpwPath();
        projectEpwLabel.textContent = epw || '(not set)';
    }

    if (generateBtn) {
        generateBtn.addEventListener('click', async () => {
            try {
                const { generateAndStoreIdf } = await import('./energyplus.js');
                await generateAndStoreIdf();
                if (outputConsole) {
                    outputConsole.textContent = 'IDF generated and stored as model.idf\n';
                }
            } catch (err) {
                console.error('EnergyPlus: failed to generate IDF from project', err);
                if (outputConsole) {
                    outputConsole.textContent += `Error generating IDF: ${err.message} \n`;
                }
                alert('Failed to generate IDF from project. Check console for details.');
            }
        });
    }

    if (runBtn) {
        let epOutputListener = null;
        let epExitListener = null;

        runBtn.addEventListener('click', () => {
            if (!window.electronAPI) {
                if (outputConsole) {
                    outputConsole.textContent += 'Electron environment not detected. Please run via Electron or use the generated IDF/scripts.\n';
                }
                alert('EnergyPlus can only be run directly inside the Electron app. In browser, use the generated IDF/scripts manually.');
                return;
            }

            const idfInput = panel.querySelector('#idf-file');
            const epwInput = panel.querySelector('#epw-file');
            const exeInput = panel.querySelector('#eplus-exe');

            const idfPath = idfInput && idfInput.files && idfInput.files[0] ? idfInput.files[0].path || idfInput.files[0].name : 'model.idf';

            const explicitEpw = epwInput && epwInput.files && epwInput.files[0] ? epwInput.files[0].path || epwInput.files[0].name : null;
            const projectEpw = getProjectEpwPath();
            const epwPath = explicitEpw || projectEpw || null;

            const energyPlusPath = exeInput && exeInput.value ? exeInput.value.trim() : null;

            if (!epwPath) {
                alert('No EPW specified. Select an EPW here or configure a project-level EPW in the "Weather & Location" panel.');
                return;
            }

            if (!energyPlusPath) {
                alert('Specify the EnergyPlus executable path.');
                return;
            }

            const runName = getRunName();
            const runId = `${runName}-${Date.now()}`;

            const preRun = validateEnergyPlusRunRequest({
                idfPath,
                epwPath,
                energyPlusPath,
                recipeId: recipe.id,
            });

            if (!preRun.ok) {
                const summary = formatIssuesSummary(preRun.issues, 4);
                if (outputConsole) {
                    outputConsole.textContent += 'Pre-run validation failed:\n' + (summary || 'Blocking configuration issues detected.') + '\n\n';
                    outputConsole.scrollTop = outputConsole.scrollHeight;
                }
                alert('Cannot start EnergyPlus run due to configuration issues.\n\n' + (summary || 'Check the EnergyPlus sidebar configuration and diagnostics.'));
                return;
            }

            resultsManager.registerEnergyPlusRun(runId, {
                label: `EnergyPlus ${runName}`,
                recipeId: recipe.id,
            });

            if (outputConsole) {
                outputConsole.textContent = `Running EnergyPlus [${runName}]...\nIDF: ${idfPath}\nEPW: ${epwPath}\nExe: ${energyPlusPath}\nOutputs: runs/${runName}/ (if supported by Electron bridge)\n\n`;
            }

            if (window.electronAPI.offEnergyPlusOutput && epOutputListener) {
                window.electronAPI.offEnergyPlusOutput(epOutputListener);
                epOutputListener = null;
            }
            if (window.electronAPI.offEnergyPlusExit && epExitListener) {
                window.electronAPI.offEnergyPlusExit(epExitListener);
                epExitListener = null;
            }

            const runOptions = {
                idfPath,
                epwPath,
                energyPlusPath,
                runName,
                runId,
            };

            window.electronAPI.runEnergyPlus(runOptions);

            const handleOutput = (payload) => {
                if (!outputConsole) return;
                let text = '';
                if (payload && typeof payload === 'object' && typeof payload.chunk === 'string') {
                    if (payload.runId && payload.runId !== runId) return;
                    text = payload.chunk;
                } else {
                    text = String(payload ?? '');
                }
                if (!text) return;
                outputConsole.textContent += text;
                outputConsole.scrollTop = outputConsole.scrollHeight;
            };

            const handleExit = (payload) => {
                if (payload && typeof payload === 'object' && payload.runId && payload.runId !== runId) return;

                const code = typeof payload === 'object' && payload !== null ? (typeof payload.exitCode === 'number' ? payload.exitCode : 0) : (typeof payload === 'number' ? payload : 0);
                const resolvedRunId = (payload && typeof payload === 'object' && payload.runId) || runId;
                const baseDir = payload && typeof payload === 'object' ? payload.outputDir : undefined;
                const errContent = payload && typeof payload === 'object' ? payload.errContent : undefined;
                const csvContents = payload && typeof payload === 'object' ? payload.csvContents : undefined;

                const runRecord = resultsManager.parseEnergyPlusResults(resolvedRunId, {
                    baseDir,
                    errContent,
                    csvContents,
                    statusFromRunner: code,
                });

                if (outputConsole) {
                    outputConsole.textContent += `\n--- EnergyPlus exited with code: ${code} ---\n`;
                    if (runRecord && runRecord.errors) {
                        const { fatal, severe, warning } = runRecord.errors;
                        const lines = [];
                        if (fatal.length) {
                            lines.push(`Fatal errors: ${fatal.length}`);
                            lines.push(fatal[0]);
                        }
                        if (severe.length) {
                            lines.push(`Severe errors: ${severe.length}`);
                            if (!fatal.length) lines.push(severe[0]);
                        }
                        if (warning.length) lines.push(`Warnings: ${warning.length}`);
                        if (lines.length) outputConsole.textContent += lines.join('\n') + '\n';
                    }
                    outputConsole.scrollTop = outputConsole.scrollHeight;
                }

                if (window.electronAPI.offEnergyPlusOutput && epOutputListener) {
                    window.electronAPI.offEnergyPlusOutput(epOutputListener);
                    epOutputListener = null;
                }
                if (window.electronAPI.offEnergyPlusExit && epExitListener) {
                    window.electronAPI.offEnergyPlusExit(epExitListener);
                    epExitListener = null;
                }
            };

            if (window.electronAPI.onEnergyPlusOutput) {
                epOutputListener = window.electronAPI.onEnergyPlusOutput(handleOutput);
            }
            if (window.electronAPI.onceEnergyPlusExit) {
                epExitListener = window.electronAPI.onceEnergyPlusExit(handleExit);
            } else if (window.electronAPI.onEnergyPlusExit) {
                epExitListener = window.electronAPI.onEnergyPlusExit(handleExit);
            }
        });
    }

    return panel;
}

/**
 * ENERGYPLUS MATERIALS MANAGER
 * OpenStudio-style JS-only manager for meta.energyPlusConfig.materials.
 *
 * - Lists materials from project metadata (energyPlusConfig.materials || []).
 * - Supports types: Material, Material:NoMass, WindowMaterial:SimpleGlazingSystem.
 * - Add / Edit via inline form.
 * - Delete is blocked if material is referenced by any construction.layers.
 */
// Materials & Constructions Manager functions moved to energyplusMaterials.js

/**
 * ENERGYPLUS ZONE LOADS MANAGER
 * Per-zone loads control panel, backed by energyPlusConfig.zoneLoads.
 */
function openZoneLoadsManagerPanel() {
    const panelId = 'panel-energyplus-zone-loads';
    const btnId = 'toggle-panel-zone-loads-btn';
    const btn = document.getElementById(btnId);

    let panel = document.getElementById(panelId);

    // Toggle logic: if open, close it
    if (panel && !panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
        if (btn) btn.classList.remove('active');
        return;
    }

    if (!panel) {
        panel = createZoneLoadsManagerPanel();
        document.getElementById('window-container').appendChild(panel);
    }
    panel.classList.remove('hidden');
    panel.style.zIndex = getNewZIndex();

    if (btn) btn.classList.add('active');
}

function createZoneLoadsManagerPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-energyplus-zone-loads';
    panel.className = 'floating-window ui-panel resizable-panel';
    panel.style.width = '600px';
    panel.style.height = '600px';

    panel.innerHTML = `
            <div class="window-header">
                <span>Zone Loads Manager</span>
                <div class="window-controls">
                    <div class="window-icon-max" title="Maximize/Restore"></div>
                    <div class="collapse-icon" title="Minimize"></div>
                    <div class="window-icon-close" title="Close"></div>
                </div>
            </div>
            <div class="window-content" style="display: flex; flex-direction: column; height: 100%; overflow: hidden;">
                <div class="resize-handle-edge top"></div>
                <div class="resize-handle-edge right"></div>
                <div class="resize-handle-edge bottom"></div>
                <div class="resize-handle-edge left"></div>
                <div class="resize-handle-corner top-left"></div>
                <div class="resize-handle-corner top-right"></div>
                <div class="resize-handle-corner bottom-left"></div>
                <div class="resize-handle-corner bottom-right"></div>
                
                <div style="display: flex; flex: 1; overflow: hidden;">
                    <!-- Left Sidebar: Category List -->
                    <div style="width: 200px; border-right: 1px solid var(--grid-color); display: flex; flex-direction: column;">
                        <div style="padding: 0.5rem; border-bottom: 1px solid var(--grid-color);">
                            <span class="label">Load Types</span>
                        </div>
                        <div id="zone-loads-categories" class="scrollable-panel-inner" style="flex: 1; overflow-y: auto;">
                            <!-- Categories injected here -->
                        </div>
                    </div>

                    <!-- Right Content: Editor -->
                    <div id="zone-loads-content" style="flex: 1; padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
                        <!-- Dynamic Content -->
                    </div>
                </div>
            </div>
        `;

    if (typeof window !== 'undefined' && window.initializePanelControls) {
        window.initializePanelControls(panel);
    } else {
        const closeBtn = panel.querySelector('.window-icon-close');
        if (closeBtn) {
            closeBtn.onclick = () => {
                panel.classList.add('hidden');
                const btn = document.getElementById('toggle-panel-zone-loads-btn');
                if (btn) btn.classList.remove('active');
            };
        }
    }

    const categoryContainer = panel.querySelector('#zone-loads-categories');
    const contentContainer = panel.querySelector('#zone-loads-content');
    let activeTab = 'people';

    const categories = [
        { id: 'people', label: 'People' },
        { id: 'lights', label: 'Lights' },
        { id: 'electric', label: 'Electric Equipment' },
        { id: 'gas', label: 'Gas Equipment' },
        { id: 'hotwater', label: 'Hot Water Equipment' },
        { id: 'steam', label: 'Steam Equipment' },
        { id: 'other', label: 'Other Equipment' }
    ];

    function renderCategories() {
        categoryContainer.innerHTML = '';
        categories.forEach(cat => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.style.cssText = 'padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--grid-color);';
            if (cat.id === activeTab) {
                item.style.backgroundColor = 'var(--accent-color)';
                item.style.color = 'white';
            }

            item.innerHTML = `<div class="text-xs">${cat.label}</div>`;

            item.addEventListener('click', () => {
                activeTab = cat.id;
                renderCategories();
                renderTab();
            });

            item.addEventListener('mouseenter', () => {
                if (cat.id !== activeTab) {
                    item.style.backgroundColor = 'var(--hover-bg)';
                }
            });

            item.addEventListener('mouseleave', () => {
                if (cat.id !== activeTab) {
                    item.style.backgroundColor = '';
                }
            });

            categoryContainer.appendChild(item);
        });
    }

    function getZones() {
        // Use project.getZones() if available, or fallback
        if (typeof project.getZones === 'function') return project.getZones();
        return project.zones || [];
    }

    function getScheduleNames(ep) {
        const names = new Set();
        if (ep.schedules) {
            if (ep.schedules.compact) ep.schedules.compact.forEach(s => names.add(s.name));
            if (ep.schedules.file) ep.schedules.file.forEach(s => names.add(s.name));
            if (ep.schedules.constant) ep.schedules.constant.forEach(s => names.add(s.name));
            // Add defaults
            ['AlwaysOn', 'Office_Occ', 'Office_Light', 'Office_Equip'].forEach(n => names.add(n));
        }
        return Array.from(names).sort();
    }

    // Generic renderer for internal gains
    function renderGenericManager(typeConfig) {
        const { ep, config } = getConfig(project);
        const data = config[typeConfig.dataKey] || [];
        const zones = getZones();
        const schedules = getScheduleNames(ep || {});

        contentContainer.innerHTML = `
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-semibold text-sm uppercase">${typeConfig.title}</h3>
                    <button class="btn btn-xs btn-primary" id="add-item-btn">Add ${typeConfig.itemName}</button>
                </div>
                <div class="overflow-x-auto border border-gray-700 rounded bg-black/20">
                    <table class="w-full text-xs text-left">
                        <thead class="bg-black/40 text-[--text-secondary]">
                            <tr>
                                <th class="p-2 font-medium">Name</th>
                                <th class="p-2 font-medium">Zone</th>
                                <th class="p-2 font-medium">Schedule</th>
                                <th class="p-2 font-medium">Method</th>
                                <th class="p-2 font-medium">Value</th>
                                <th class="p-2 w-20 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-700/50">
                            ${data.map((item, index) => `
                                <tr class="hover:bg-white/5 transition-colors">
                                    <td class="p-2">${item.name || '-'}</td>
                                    <td class="p-2">${item.zoneName || '-'}</td>
                                    <td class="p-2">${item.scheduleName || '-'}</td>
                                    <td class="p-2">${item.method || '-'}</td>
                                    <td class="p-2">${formatValue(item)}</td>
                                    <td class="p-2 text-right">
                                        <button class="btn btn-xxs btn-secondary edit-btn mr-1" data-index="${index}">Edit</button>
                                        <button class="btn btn-xxs btn-danger delete-btn" data-index="${index}">&times;</button>
                                    </td>
                                </tr>
                            `).join('')}
                            ${data.length === 0 ? '<tr><td colspan="6" class="p-4 text-center text-[--text-secondary] italic">No items defined.</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            `;

        // Add Listeners
        contentContainer.querySelector('#add-item-btn').addEventListener('click', () => {
            editItem(null, typeConfig, zones, schedules);
        });

        contentContainer.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                editItem(idx, typeConfig, zones, schedules);
            });
        });

        contentContainer.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                if (confirm('Are you sure you want to delete this item?')) {
                    const newData = [...data];
                    newData.splice(idx, 1);
                    typeConfig.setter(project, newData);
                    renderTab();
                }
            });
        });
    }

    function formatValue(item) {
        // Helper to show the relevant value based on method
        if (item.method === 'People') return item.numberPeople;
        if (item.method === 'People/Area') return item.peoplePerArea;
        if (item.method === 'Area/Person') return item.areaPerPerson;
        if (item.method === 'Watts/Area') return item.wattsPerArea;
        if (item.method === 'Watts/Person') return item.wattsPerPerson;
        if (item.method === 'Level') return item.lightingLevel || item.designLevel;
        return '-';
    }

    function editItem(index, typeConfig, zones, schedules) {
        const { config } = getConfig(project);
        const data = config[typeConfig.dataKey] || [];
        const item = index !== null ? data[index] : { name: `New ${typeConfig.itemName}`, method: typeConfig.defaultMethod };
        const isNew = index === null;

        // Generate form fields
        const renderLabel = (text, tooltip) => {
            if (!tooltip) return `<label class="label">${text}</label>`;
            return `
                <label class="label">
                    ${text}
                    <span class="info-icon">i
                        <span class="info-popover">${tooltip}</span>
                    </span>
                </label>
            `;
        };

        const fieldsHtml = typeConfig.fields.map(field => {
            const val = item[field.key] !== undefined ? item[field.key] : (field.default || '');
            const tooltip = field.tooltip || '';

            // Visibility logic attributes
            let wrapperAttrs = 'class="mb-3 field-wrapper"';
            if (field.visibleWhen) {
                wrapperAttrs += ` data-visible-when='${JSON.stringify(field.visibleWhen)}'`;
                // Initial visibility check (simple equality for now)
                const { key, value } = field.visibleWhen;
                wrapperAttrs += ` data-visible-when='${JSON.stringify({ key, value })}'`;
                // Check initial visibility
                const depVal = item[key];
                const isVisible = Array.isArray(value) ? value.includes(depVal) : value === depVal;

                // If depVal is undefined (e.g. new item), check against defaultMethod if the dependency key is 'method'
                const currentMethod = item.method || typeConfig.defaultMethod;
                const isVisibleForDefault = (key === 'method' && Array.isArray(value) ? value.includes(currentMethod) : value === currentMethod);

                if (!isVisible && depVal !== undefined) {
                    wrapperAttrs += ' style="display: none;"';
                } else if (depVal === undefined && key === 'method' && !isVisibleForDefault) {
                    wrapperAttrs += ' style="display: none;"';
                }
            }

            if (field.type === 'select') {
                const options = typeof field.options === 'function' ? field.options(zones, schedules) : field.options; // Pass zones, schedules
                return `
                    <div ${wrapperAttrs}>
                        ${renderLabel(field.label, tooltip)}
                        <select class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" 
                                data-key="${field.key}">
                            <option value="">(Select)</option>
                            ${options.map(o => `<option value="${o.value}" ${o.value == val ? 'selected' : ''}>${o.label}</option>`).join('')}
                        </select>
                    </div>
                `;
            } else if (field.type === 'number') {
                const minAttr = field.min !== undefined ? `min="${field.min}"` : '';
                const maxAttr = field.max !== undefined ? `max="${field.max}"` : '';
                return `
                    <div ${wrapperAttrs}>
                        ${renderLabel(field.label, tooltip)}
                        <input type="number" step="${field.step || 'any'}" ${minAttr}${maxAttr}
                               class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" 
                               data-key="${field.key}" value="${val}">
                    </div>
                `;
            } else {
                return `
                    <div ${wrapperAttrs}>
                        ${renderLabel(field.label, tooltip)}
                        <input type="text" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" 
                               data-key="${field.key}" value="${val}">
                    </div>
                `;
            }
        }).join('');

        contentContainer.innerHTML = `
            <div class="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                <h3 class="font-semibold text-sm uppercase">${isNew ? 'Add' : 'Edit'}${typeConfig.itemName}</h3>
                <button class="btn btn-xs btn-secondary" id="cancel-edit-btn">Cancel</button>
            </div>
            <div class="space-y-2" id="editor-fields">
                ${fieldsHtml}
                <div class="mt-4 pt-4 border-t border-gray-700 flex justify-end gap-2">
                    <button class="btn btn-sm btn-primary" id="save-item-btn">Save</button>
                </div>
            </div>
        `;

        // Visibility Handler
        const updateVisibility = () => {
            const wrappers = contentContainer.querySelectorAll('.field-wrapper[data-visible-when]');
            wrappers.forEach(wrapper => {
                const rule = JSON.parse(wrapper.dataset.visibleWhen);
                const depInput = contentContainer.querySelector(`[data-key="${rule.key}"]`);
                if (depInput) {
                    const val = depInput.value;
                    const isVisible = Array.isArray(rule.value) ? rule.value.includes(val) : rule.value === val;
                    wrapper.style.display = isVisible ? 'block' : 'none';
                }
            });
        };

        // Attach listeners for dependencies
        contentContainer.querySelectorAll('select[data-key]').forEach(sel => {
            sel.addEventListener('change', updateVisibility);
        });

        // Initial update
        updateVisibility();

        contentContainer.querySelector('#cancel-edit-btn').addEventListener('click', () => renderTab());
        contentContainer.querySelector('#save-item-btn').addEventListener('click', () => {
            const inputs = contentContainer.querySelectorAll('[data-key]');
            const newItem = { ...item };
            inputs.forEach(input => {
                // Only save if visible (or not dependent)
                const wrapper = input.closest('.field-wrapper');
                if (wrapper && wrapper.style.display === 'none') return;

                const key = input.dataset.key;
                let val = input.value;
                if (input.type === 'number') val = parseFloat(val);
                newItem[key] = val;
            });

            const newData = [...data];
            if (isNew) {
                newData.push(newItem);
            } else {
                newData[index] = newItem;
            }
            typeConfig.setter(project, newData);
            renderTab();
        });
    }

    function renderTab() {
        const zoneOptions = (zones) => zones.map(z => ({ value: z.name, label: z.name }));
        const schedOptions = (zones, scheds) => scheds.map(s => ({ value: s, label: s }));

        const commonFields = [
            { key: 'name', label: 'Name', type: 'text', tooltip: 'Unique name for this object.' },
            { key: 'zoneName', label: 'Zone', type: 'select', options: zoneOptions, tooltip: 'The thermal zone this object applies to.' },
            { key: 'scheduleName', label: 'Schedule', type: 'select', options: schedOptions, tooltip: 'Schedule modifying the design level parameter.' },
        ];

        const configs = {
            people: {
                title: 'People', itemName: 'People Object', dataKey: 'people', setter: setPeople,
                defaultMethod: 'People',
                fields: [
                    ...commonFields,
                    {
                        key: 'method', label: 'Method', type: 'select', tooltip: 'Method for calculating the number of people.', options: [
                            { value: 'People', label: 'Number of People' },
                            { value: 'People/Area', label: 'People per Zone Floor Area' },
                            { value: 'Area/Person', label: 'Zone Floor Area per Person' }
                        ]
                    },
                    { key: 'numberPeople', label: 'Number of People', type: 'number', min: 0, visibleWhen: { key: 'method', value: 'People' }, tooltip: 'Maximum number of people in the zone.' },
                    { key: 'peoplePerArea', label: 'People per Area', type: 'number', step: 0.01, min: 0, visibleWhen: { key: 'method', value: 'People/Area' }, tooltip: 'People per square meter of floor area.' },
                    { key: 'areaPerPerson', label: 'Area per Person', type: 'number', step: 0.01, min: 0, visibleWhen: { key: 'method', value: 'Area/Person' }, tooltip: 'Square meters of floor area per person.' },
                    { key: 'fractionRadiant', label: 'Fraction Radiant', type: 'number', step: 0.1, min: 0, max: 1, default: 0.3, tooltip: 'Fraction of sensible heat given off as radiant heat (0.0-1.0).' },
                    { key: 'sensibleHeatFraction', label: 'Sensible Heat Fraction', type: 'number', step: 0.1, min: 0, max: 1, default: 'autocalculate', tooltip: 'Fixed sensible heat fraction. Leave blank for autocalculate.' },
                    { key: 'activityScheduleName', label: 'Activity Schedule', type: 'select', options: schedOptions, tooltip: 'Schedule defining metabolic rate (W/person).' },
                ]
            },
            lights: {
                title: 'Lights', itemName: 'Lights Object', dataKey: 'lights', setter: setLights,
                defaultMethod: 'Watts/Area',
                fields: [
                    ...commonFields,
                    {
                        key: 'method', label: 'Method', type: 'select', tooltip: 'Method for calculating the lighting level.', options: [
                            { value: 'Watts/Area', label: 'Watts per Zone Floor Area' },
                            { value: 'Watts/Person', label: 'Watts per Person' },
                            { value: 'Level', label: 'Lighting Level' }
                        ]
                    },
                    { key: 'wattsPerArea', label: 'Watts per Area', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Watts/Area' }, tooltip: 'Lighting power density (W/m²).' },
                    { key: 'wattsPerPerson', label: 'Watts per Person', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Watts/Person' }, tooltip: 'Lighting power per person (W/person).' },
                    { key: 'lightingLevel', label: 'Lighting Level', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Level' }, tooltip: 'Total lighting power (W).' },
                    { key: 'returnAirFraction', label: 'Return Air Fraction', type: 'number', step: 0.1, min: 0, max: 1, default: 0, tooltip: 'Fraction of heat going to return air.' },
                    { key: 'fractionRadiant', label: 'Fraction Radiant', type: 'number', step: 0.1, min: 0, max: 1, default: 0.7, tooltip: 'Fraction of heat entering zone as long-wave radiation.' },
                    { key: 'fractionVisible', label: 'Fraction Visible', type: 'number', step: 0.1, min: 0, max: 1, default: 0.2, tooltip: 'Fraction of heat entering zone as visible radiation.' },
                ]
            },
            electric: {
                title: 'Electric Equipment', itemName: 'Equipment', dataKey: 'electricEquipment', setter: setElectricEquipment,
                defaultMethod: 'Watts/Area',
                fields: [
                    ...commonFields,
                    {
                        key: 'method', label: 'Method', type: 'select', tooltip: 'Method for calculating the equipment level.', options: [
                            { value: 'Watts/Area', label: 'Watts per Zone Floor Area' },
                            { value: 'Watts/Person', label: 'Watts per Person' },
                            { value: 'Level', label: 'Design Level' }
                        ]
                    },
                    { key: 'wattsPerArea', label: 'Watts per Area', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Watts/Area' }, tooltip: 'Equipment power density (W/m²).' },
                    { key: 'wattsPerPerson', label: 'Watts per Person', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Watts/Person' }, tooltip: 'Equipment power per person (W/person).' },
                    { key: 'designLevel', label: 'Design Level', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Level' }, tooltip: 'Total equipment power (W).' },
                    { key: 'fractionLatent', label: 'Fraction Latent', type: 'number', step: 0.1, min: 0, max: 1, default: 0, tooltip: 'Fraction of heat given off as latent energy (moisture).' },
                    { key: 'fractionRadiant', label: 'Fraction Radiant', type: 'number', step: 0.1, min: 0, max: 1, default: 0.3, tooltip: 'Fraction of heat given off as radiant energy.' },
                    { key: 'fractionLost', label: 'Fraction Lost', type: 'number', step: 0.1, min: 0, max: 1, default: 0, tooltip: 'Fraction of heat lost (vented) from the zone.' },
                ]
            },
            gas: {
                title: 'Gas Equipment', itemName: 'Gas Equipment', dataKey: 'gasEquipment', setter: setGasEquipment,
                defaultMethod: 'Watts/Area',
                fields: [
                    ...commonFields,
                    {
                        key: 'method', label: 'Method', type: 'select', tooltip: 'Method for calculating the equipment level.', options: [
                            { value: 'Watts/Area', label: 'Watts per Zone Floor Area' },
                            { value: 'Watts/Person', label: 'Watts per Person' },
                            { value: 'Level', label: 'Design Level' }
                        ]
                    },
                    { key: 'wattsPerArea', label: 'Watts per Area', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Watts/Area' }, tooltip: 'Gas power density (W/m²).' },
                    { key: 'wattsPerPerson', label: 'Watts per Person', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Watts/Person' }, tooltip: 'Gas power per person (W/person).' },
                    { key: 'designLevel', label: 'Design Level', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Level' }, tooltip: 'Total gas power (W).' },
                    { key: 'fractionLatent', label: 'Fraction Latent', type: 'number', step: 0.1, min: 0, max: 1, default: 0, tooltip: 'Fraction of heat given off as latent energy.' },
                    { key: 'fractionRadiant', label: 'Fraction Radiant', type: 'number', step: 0.1, min: 0, max: 1, default: 0.3, tooltip: 'Fraction of heat given off as radiant energy.' },
                    { key: 'fractionLost', label: 'Fraction Lost', type: 'number', step: 0.1, min: 0, max: 1, default: 0, tooltip: 'Fraction of heat lost (vented).' },
                ]
            },
            hotwater: {
                title: 'Hot Water Equipment', itemName: 'Hot Water Equipment', dataKey: 'hotWaterEquipment', setter: setHotWaterEquipment,
                defaultMethod: 'Watts/Area',
                fields: [
                    ...commonFields,
                    {
                        key: 'method', label: 'Method', type: 'select', tooltip: 'Method for calculating the equipment level.', options: [
                            { value: 'Watts/Area', label: 'Watts per Zone Floor Area' },
                            { value: 'Watts/Person', label: 'Watts per Person' },
                            { value: 'Level', label: 'Design Level' }
                        ]
                    },
                    { key: 'wattsPerArea', label: 'Watts per Area', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Watts/Area' }, tooltip: 'Hot water power density (W/m²).' },
                    { key: 'wattsPerPerson', label: 'Watts per Person', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Watts/Person' }, tooltip: 'Hot water power per person (W/person).' },
                    { key: 'designLevel', label: 'Design Level', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Level' }, tooltip: 'Total hot water power (W).' },
                    { key: 'fractionLatent', label: 'Fraction Latent', type: 'number', step: 0.1, min: 0, max: 1, default: 0, tooltip: 'Fraction of heat given off as latent energy.' },
                    { key: 'fractionRadiant', label: 'Fraction Radiant', type: 'number', step: 0.1, min: 0, max: 1, default: 0.3, tooltip: 'Fraction of heat given off as radiant energy.' },
                    { key: 'fractionLost', label: 'Fraction Lost', type: 'number', step: 0.1, min: 0, max: 1, default: 0, tooltip: 'Fraction of heat lost (vented).' },
                ]
            },
            steam: {
                title: 'Steam Equipment', itemName: 'Steam Equipment', dataKey: 'steamEquipment', setter: setSteamEquipment,
                defaultMethod: 'Watts/Area',
                fields: [
                    ...commonFields,
                    {
                        key: 'method', label: 'Method', type: 'select', tooltip: 'Method for calculating the equipment level.', options: [
                            { value: 'Watts/Area', label: 'Watts per Zone Floor Area' },
                            { value: 'Watts/Person', label: 'Watts per Person' },
                            { value: 'Level', label: 'Design Level' }
                        ]
                    },
                    { key: 'wattsPerArea', label: 'Watts per Area', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Watts/Area' }, tooltip: 'Steam power density (W/m²).' },
                    { key: 'wattsPerPerson', label: 'Watts per Person', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Watts/Person' }, tooltip: 'Steam power per person (W/person).' },
                    { key: 'designLevel', label: 'Design Level', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Level' }, tooltip: 'Total steam power (W).' },
                    { key: 'fractionLatent', label: 'Fraction Latent', type: 'number', step: 0.1, min: 0, max: 1, default: 0, tooltip: 'Fraction of heat given off as latent energy.' },
                    { key: 'fractionRadiant', label: 'Fraction Radiant', type: 'number', step: 0.1, min: 0, max: 1, default: 0.3, tooltip: 'Fraction of heat given off as radiant energy.' },
                    { key: 'fractionLost', label: 'Fraction Lost', type: 'number', step: 0.1, min: 0, max: 1, default: 0, tooltip: 'Fraction of heat lost (vented).' },
                ]
            },
            other: {
                title: 'Other Equipment', itemName: 'Other Equipment', dataKey: 'otherEquipment', setter: setOtherEquipment,
                defaultMethod: 'Watts/Area',
                fields: [
                    ...commonFields,
                    {
                        key: 'method', label: 'Method', type: 'select', tooltip: 'Method for calculating the equipment level.', options: [
                            { value: 'Watts/Area', label: 'Watts per Zone Floor Area' },
                            { value: 'Watts/Person', label: 'Watts per Person' },
                            { value: 'Level', label: 'Design Level' }
                        ]
                    },
                    { key: 'wattsPerArea', label: 'Watts per Area', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Watts/Area' }, tooltip: 'Power density (W/m²).' },
                    { key: 'wattsPerPerson', label: 'Watts per Person', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Watts/Person' }, tooltip: 'Power per person (W/person).' },
                    { key: 'designLevel', label: 'Design Level', type: 'number', step: 0.1, min: 0, visibleWhen: { key: 'method', value: 'Level' }, tooltip: 'Total power (W).' },
                    { key: 'fractionLatent', label: 'Fraction Latent', type: 'number', step: 0.1, min: 0, max: 1, default: 0, tooltip: 'Fraction of heat given off as latent energy.' },
                    { key: 'fractionRadiant', label: 'Fraction Radiant', type: 'number', step: 0.1, min: 0, max: 1, default: 0.3, tooltip: 'Fraction of heat given off as radiant energy.' },
                    { key: 'fractionLost', label: 'Fraction Lost', type: 'number', step: 0.1, min: 0, max: 1, default: 0, tooltip: 'Fraction of heat lost (vented).' },
                ]
            }
        };

        if (configs[activeTab]) {
            renderGenericManager(configs[activeTab]);
        }
    }

    renderCategories();
    renderTab();
    return panel;
}

/**
 * DAYLIGHTING MANAGER
 * Manage energyPlusConfig.daylighting.controls and .outputs.illuminanceMaps.
 */
function openHvacSizingManagerPanel() {
    const panelId = 'panel-energyplus-hvac-sizing';
    let panel = document.getElementById(panelId);
    if (!panel) {
        panel = createHvacSizingManagerPanel();
        document.getElementById('window-container').appendChild(panel);
    }
    panel.classList.remove('hidden');
    panel.style.zIndex = getNewZIndex();
}

/**
 * HVAC Sizing Manager
 * Configure:
 *  - sizing.zones (per-zone Sizing:Zone)
 *  - sizing.systems (Sizing:System, advanced)
 *  - sizing.plants (Sizing:Plant, advanced)
 * Uses energyPlusConfigService setters; no behavior change unless user edits.
 */
function createHvacSizingManagerPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-energyplus-hvac-sizing';
    panel.className = 'floating-window ui-panel resizable-panel';

    panel.innerHTML = `
        <div class="window-header">
            <span>HVAC Sizing</span>
            <div class="window-controls">
                <div class="window-icon-max" title="Maximize/Restore"></div>
                <div class="collapse-icon" title="Minimize"></div>
                <div class="window-icon-close" title="Close"></div>
            </div>
        </div>
        <div class="window-content space-y-3 text-xs">
            <div class="resize-handle-edge top"></div>
            <div class="resize-handle-edge right"></div>
            <div class="resize-handle-edge bottom"></div>
            <div class="resize-handle-edge left"></div>
            <div class="resize-handle-corner top-left"></div>
            <div class="resize-handle-corner top-right"></div>
            <div class="resize-handle-corner bottom-left"></div>
            <div class="resize-handle-corner bottom-right"></div>

            <p class="info-box !text-xs !py-1.5 !px-2">
                Configure EnergyPlus sizing objects used by the generated IDF.
                Settings are stored in <code>energyPlusConfig.sizing</code> and consumed by the model builder.
                If left empty, Ray-Modeler emits safe default Sizing:Zone objects and no system/plant sizing.
            </p>

            <!-- ZONE SIZING -->
            <div class="border border-gray-700/70 rounded bg-black/40 p-2 space-y-1">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">Zone Sizing</span>
                    <span class="text-xs text-[--text-secondary]">
                        Enable per-zone overrides; otherwise defaults are used.
                    </span>
                </div>
                <div class="max-h-64 overflow-y-auto scrollable-panel-inner">
                    <table class="w-full text-xs">
                        <thead class="bg-black/40">
                            <tr>
                                <th class="px-1 py-1 text-left">Zone</th>
                                <th class="px-1 py-1 text-left">Custom</th>
                                <th class="px-1 py-1 text-left">Cool SAT/ΔT</th>
                                <th class="px-1 py-1 text-left">Heat SAT/ΔT</th>
                                <th class="px-1 py-1 text-left">SF (H/C)</th>
                                <th class="px-1 py-1 text-left">DSOA Name</th>
                            </tr>
                        </thead>
                        <tbody class="hvac-sizing-zones-tbody"></tbody>
                    </table>
                </div>
            </div>

            <!-- SYSTEM SIZING (ADVANCED) -->
            <details class="border border-gray-700/70 rounded bg-black/40 p-2 space-y-1">
                <summary class="font-semibold text-xs uppercase text-[--text-secondary] cursor-pointer">
                    System Sizing (Sizing:System, advanced)
                </summary>
                <div class="flex justify-end mb-1">
                    <button class="btn btn-xxs btn-secondary" data-action="add-system-sizing">+ Add System</button>
                </div>
                <div class="max-h-40 overflow-y-auto scrollable-panel-inner">
                    <table class="w-full text-xs">
                        <thead class="bg-black/40">
                            <tr>
                                <th class="px-1 py-1 text-left">Air Loop Name</th>
                                <th class="px-1 py-1 text-left">Load Type</th>
                                <th class="px-1 py-1 text-left">Design OA [m³/s] / auto</th>
                                <th class="px-1 py-1 text-left">Cool/Heat SAT [°C]</th>
                                <th class="px-1 py-1 text-left">OA Method</th>
                                <th class="px-1 py-1 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="hvac-sizing-systems-tbody"></tbody>
                    </table>
                </div>
                <p class="text-xs text-[--text-secondary] mt-1">
                    Only define entries if you have explicit system-level sizing requirements.
                    Rows without an Air Loop Name are ignored.
                </p>
            </details>

            <!-- PLANT SIZING (ADVANCED) -->
            <details class="border border-gray-700/70 rounded bg-black/40 p-2 space-y-1">
                <summary class="font-semibold text-xs uppercase text-[--text-secondary] cursor-pointer">
                    Plant Sizing (Sizing:Plant, advanced)
                </summary>
                <div class="flex justify-end mb-1">
                    <button class="btn btn-xxs btn-secondary" data-action="add-plant-sizing">+ Add Plant Loop</button>
                </div>
                <div class="max-h-32 overflow-y-auto scrollable-panel-inner">
                    <table class="w-full text-xs">
                        <thead class="bg-black/40">
                            <tr>
                                <th class="px-1 py-1 text-left">Plant Loop Name</th>
                                <th class="px-1 py-1 text-left">Exit T [°C]</th>
                                <th class="px-1 py-1 text-left">ΔT [K]</th>
                                <th class="px-1 py-1 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="hvac-sizing-plants-tbody"></tbody>
                    </table>
                </div>
                <p class="text-xs text-[--text-secondary] mt-1">
                    Define only for explicit hydronic loops. Rows without a Plant Loop Name are ignored.
                </p>
            </details>

            <div class="flex justify-end">
                <button class="btn btn-xxs btn-secondary" data-action="save-hvac-sizing">
                    Save HVAC Sizing
                </button>
            </div>
        </div>
    `;

    if (typeof window !== 'undefined' && window.initializePanelControls) {
        window.initializePanelControls(panel);
    } else {
        const closeBtn = panel.querySelector('.window-icon-close');
        if (closeBtn) {
            closeBtn.onclick = () => panel.classList.add('hidden');
        }
    }

    // Lazy-load config helpers to avoid circular deps at module parse time.
    import('./energyplusConfigService.js').then(
        ({ getConfig, setSizingZones, setSizingSystems, setSizingPlants }) => {
            const zonesTbody = panel.querySelector('.hvac-sizing-zones-tbody');
            const systemsTbody = panel.querySelector('.hvac-sizing-systems-tbody');
            const plantsTbody = panel.querySelector('.hvac-sizing-plants-tbody');
            const saveBtn = panel.querySelector('[data-action="save-hvac-sizing"]');
            const addSysBtn = panel.querySelector('[data-action="add-system-sizing"]');
            const addPlantBtn = panel.querySelector('[data-action="add-plant-sizing"]');

            function getZones() {
                let zs = [];
                if (typeof project.getZones === 'function') {
                    zs = project.getZones() || [];
                } else if (Array.isArray(project.zones)) {
                    zs = project.zones;
                }
                if (!Array.isArray(zs) || !zs.length) {
                    return [{ name: 'Zone_1' }];
                }
                return zs.map((z, i) => ({
                    name: z.name || `Zone_${i + 1}`,
                }));
            }

            function readState() {
                const { config } = getConfig(project);
                const sizing = config.sizing || {};
                return {
                    zones: Array.isArray(sizing.zones) ? sizing.zones.slice() : [],
                    systems: Array.isArray(sizing.systems) ? sizing.systems.slice() : [],
                    plants: Array.isArray(sizing.plants) ? sizing.plants.slice() : [],
                    outdoorAir: config.outdoorAir || {},
                };
            }

            function renderZones() {
                const { zones, outdoorAir } = readState();
                const zoneList = getZones();
                const dsoaNames = Array.isArray(outdoorAir.designSpecs)
                    ? outdoorAir.designSpecs.map((d) => d && d.name).filter(Boolean)
                    : [];
                zonesTbody.innerHTML = '';
                zoneList.forEach((z) => {
                    const zn = String(z.name);
                    const cfg = zones.find((e) => e.zoneName === zn) || {};
                    const hasCustom = !!cfg.zoneName;
                    const tr = document.createElement('tr');
                    tr.dataset.zoneName = zn;
                    const dsoaOptions =
                        '<option value="">(none)</option>' +
                        dsoaNames
                            .map(
                                (n) =>
                                    `<option value="${n}"${cfg.designSpecOutdoorAirName === n ? ' selected' : ''}>${n}</option>`
                            )
                            .join('');
                    tr.innerHTML = `
                        <td class="px-1 py-1 align-top text-[--accent-color]">${zn}</td>
                        <td class="px-1 py-1 align-top">
                            <input type="checkbox" data-field="enabled" ${hasCustom ? 'checked' : ''}>
                        </td>
                        <td class="px-1 py-1 align-top">
                            <div class="grid grid-cols-2 gap-0.5">
                                <input type="number" step="0.1" class="w-full"
                                    placeholder="Cool SAT"
                                    data-field="coolSAT"
                                    value="${cfg.zoneCoolingDesignSupplyAirTemperature ?? ''}">
                                <input type="number" step="0.1" class="w-full"
                                    placeholder="ΔT"
                                    data-field="coolDT"
                                    value="${cfg.zoneCoolingDesignSupplyAirTemperatureDifference ?? ''}">
                            </div>
                        </td>
                        <td class="px-1 py-1 align-top">
                            <div class="grid grid-cols-2 gap-0.5">
                                <input type="number" step="0.1" class="w-full"
                                    placeholder="Heat SAT"
                                    data-field="heatSAT"
                                    value="${cfg.zoneHeatingDesignSupplyAirTemperature ?? ''}">
                                <input type="number" step="0.1" class="w-full"
                                    placeholder="ΔT"
                                    data-field="heatDT"
                                    value="${cfg.zoneHeatingDesignSupplyAirTemperatureDifference ?? ''}">
                            </div>
                        </td>
                        <td class="px-1 py-1 align-top">
                            <div class="grid grid-cols-2 gap-0.5">
                                <input type="number" step="0.01" class="w-full"
                                    placeholder="H"
                                    data-field="sfHeat"
                                    value="${cfg.zoneHeatingSizingFactor ?? ''}">
                                <input type="number" step="0.01" class="w-full"
                                    placeholder="C"
                                    data-field="sfCool"
                                    value="${cfg.zoneCoolingSizingFactor ?? ''}">
                            </div>
                        </td>
                        <td class="px-1 py-1 align-top">
                            <select class="w-full" data-field="dsoa">
                                ${dsoaOptions}
                            </select>
                        </td>
                    `;
                    zonesTbody.appendChild(tr);
                });
            }

            function renderSystems() {
                const { systems } = readState();
                systemsTbody.innerHTML = '';
                systems.forEach((s, idx) => {
                    const tr = document.createElement('tr');
                    tr.dataset.index = String(idx);
                    tr.innerHTML = `
                        <td class="px-1 py-1 align-top">
                            <input class="w-full" data-field="airLoopName" value="${s.airLoopName || ''}">
                        </td>
                        <td class="px-1 py-1 align-top">
                            <input class="w-full" data-field="loadType" value="${s.typeOfLoadToSizeOn || ''}" placeholder="Sensible">
                        </td>
                        <td class="px-1 py-1 align-top">
                            <input type="number" step="0.001" class="w-full" data-field="designOA" value="${typeof s.designOutdoorAirFlowRate === 'number' ? s.designOutdoorAirFlowRate : ''}" placeholder="m³/s">
                        </td>
                        <td class="px-1 py-1 align-top">
                            <div class="grid grid-cols-2 gap-0.5">
                                <input type="number" step="0.1" class="w-full" data-field="coolSAT" value="${s.centralCoolingDesignSupplyAirTemperature ?? ''}" placeholder="Cool">
                                <input type="number" step="0.1" class="w-full" data-field="heatSAT" value="${s.centralHeatingDesignSupplyAirTemperature ?? ''}" placeholder="Heat">
                            </div>
                        </td>
                        <td class="px-1 py-1 align-top">
                            <input class="w-full" data-field="oaMethod" value="${s.systemOutdoorAirMethod || ''}" placeholder="ZoneSum">
                        </td>
                        <td class="px-1 py-1 align-top text-right">
                            <button class="btn btn-xxs btn-danger" data-action="delete-system">Delete</button>
                        </td>
                    `;
                    systemsTbody.appendChild(tr);
                });
            }

            function renderPlants() {
                const { plants } = readState();
                plantsTbody.innerHTML = '';
                plants.forEach((p, idx) => {
                    const tr = document.createElement('tr');
                    tr.dataset.index = String(idx);
                    tr.innerHTML = `
                        <td class="px-1 py-1 align-top">
                            <input class="w-full" data-field="plantLoopName" value="${p.plantLoopName || ''}">
                        </td>
                        <td class="px-1 py-1 align-top">
                            <input type="number" step="0.1" class="w-full" data-field="exitT" value="${p.designLoopExitTemperature ?? ''}">
                        </td>
                        <td class="px-1 py-1 align-top">
                            <input type="number" step="0.1" class="w-full" data-field="dT" value="${p.loopDesignTemperatureDifference ?? ''}">
                        </td>
                        <td class="px-1 py-1 align-top text-right">
                            <button class="btn btn-xxs btn-danger" data-action="delete-plant">Delete</button>
                        </td>
                    `;
                    plantsTbody.appendChild(tr);
                });
            }

            function collectZonesFromUI() {
                const rows = zonesTbody.querySelectorAll('tr[data-zone-name]');
                const result = [];
                rows.forEach((tr) => {
                    const zn = tr.dataset.zoneName;
                    const enabled = tr.querySelector('[data-field="enabled"]')?.checked;
                    if (!enabled || !zn) return;
                    const num = (sel) => {
                        const el = tr.querySelector(sel);
                        if (!el) return undefined;
                        const v = parseFloat(el.value);
                        return Number.isFinite(v) ? v : undefined;
                    };
                    const dsoa = tr.querySelector('[data-field="dsoa"]')?.value || '';
                    const entry = {
                        zoneName: zn,
                    };
                    const coolSAT = num('[data-field="coolSAT"]');
                    const coolDT = num('[data-field="coolDT"]');
                    const heatSAT = num('[data-field="heatSAT"]');
                    const heatDT = num('[data-field="heatDT"]');
                    const sfH = num('[data-field="sfHeat"]');
                    const sfC = num('[data-field="sfCool"]');

                    if (Number.isFinite(coolSAT)) {
                        entry.zoneCoolingDesignSupplyAirTemperature = coolSAT;
                    }
                    if (Number.isFinite(coolDT)) {
                        entry.zoneCoolingDesignSupplyAirTemperatureDifference = coolDT;
                        entry.zoneCoolingDesignSupplyAirTemperatureInputMethod = 'TemperatureDifference';
                    }
                    if (Number.isFinite(heatSAT)) {
                        entry.zoneHeatingDesignSupplyAirTemperature = heatSAT;
                    }
                    if (Number.isFinite(heatDT)) {
                        entry.zoneHeatingDesignSupplyAirTemperatureDifference = heatDT;
                        entry.zoneHeatingDesignSupplyAirTemperatureInputMethod = 'TemperatureDifference';
                    }
                    if (Number.isFinite(sfH)) {
                        entry.zoneHeatingSizingFactor = sfH;
                    }
                    if (Number.isFinite(sfC)) {
                        entry.zoneCoolingSizingFactor = sfC;
                    }
                    if (dsoa) {
                        entry.designSpecOutdoorAirName = dsoa;
                    }

                    // Only persist if there is at least one meaningful override
                    if (
                        entry.zoneCoolingDesignSupplyAirTemperature != null ||
                        entry.zoneCoolingDesignSupplyAirTemperatureDifference != null ||
                        entry.zoneHeatingDesignSupplyAirTemperature != null ||
                        entry.zoneHeatingDesignSupplyAirTemperatureDifference != null ||
                        entry.zoneHeatingSizingFactor != null ||
                        entry.zoneCoolingSizingFactor != null ||
                        entry.designSpecOutdoorAirName
                    ) {
                        result.push(entry);
                    }
                });
                return result;
            }

            function collectSystemsFromUI() {
                const rows = systemsTbody.querySelectorAll('tr');
                const systems = [];
                rows.forEach((tr) => {
                    const airLoopName = (tr.querySelector('[data-field="airLoopName"]')?.value || '').trim();
                    if (!airLoopName) return;
                    const val = (sel) => (tr.querySelector(sel)?.value || '').trim();
                    const num = (sel) => {
                        const el = tr.querySelector(sel);
                        if (!el) return undefined;
                        const v = parseFloat(el.value);
                        return Number.isFinite(v) ? v : undefined;
                    };
                    const s = {
                        airLoopName,
                    };
                    const loadType = val('[data-field="loadType"]');
                    if (loadType) s.typeOfLoadToSizeOn = loadType;
                    const designOA = num('[data-field="designOA"]');
                    if (designOA != null) s.designOutdoorAirFlowRate = designOA;
                    const coolSAT = num('[data-field="coolSAT"]');
                    if (coolSAT != null) s.centralCoolingDesignSupplyAirTemperature = coolSAT;
                    const heatSAT = num('[data-field="heatSAT"]');
                    if (heatSAT != null) s.centralHeatingDesignSupplyAirTemperature = heatSAT;
                    const oaMethod = val('[data-field="oaMethod"]');
                    if (oaMethod) s.systemOutdoorAirMethod = oaMethod;
                    systems.push(s);
                });
                return systems;
            }

            function collectPlantsFromUI() {
                const rows = plantsTbody.querySelectorAll('tr');
                const plants = [];
                rows.forEach((tr) => {
                    const plantLoopName = (tr.querySelector('[data-field="plantLoopName"]')?.value || '').trim();
                    if (!plantLoopName) return;
                    const num = (sel) => {
                        const el = tr.querySelector(sel);
                        if (!el) return undefined;
                        const v = parseFloat(el.value);
                        return Number.isFinite(v) ? v : undefined;
                    };
                    const exitT = num('[data-field="exitT"]');
                    const dT = num('[data-field="dT"]');
                    const p = { plantLoopName };
                    if (exitT != null) p.designLoopExitTemperature = exitT;
                    if (dT != null) p.loopDesignTemperatureDifference = dT;
                    plants.push(p);
                });
                return plants;
            }

            function wireSystemAndPlantActions() {
                if (addSysBtn) {
                    addSysBtn.addEventListener('click', () => {
                        const { systems } = readState();
                        systems.push({ airLoopName: '' });
                        setSizingSystems(project, systems);
                        renderSystems();
                        wireSystemAndPlantActions();
                    });
                }
                if (systemsTbody) {
                    systemsTbody.querySelectorAll('button[data-action="delete-system"]').forEach((btn, idx) => {
                        btn.addEventListener('click', () => {
                            const { systems } = readState();
                            systems.splice(idx, 1);
                            setSizingSystems(project, systems);
                            renderSystems();
                            wireSystemAndPlantActions();
                        });
                    });
                }

                if (addPlantBtn) {
                    addPlantBtn.addEventListener('click', () => {
                        const { plants } = readState();
                        plants.push({ plantLoopName: '' });
                        setSizingPlants(project, plants);
                        renderPlants();
                        wireSystemAndPlantActions();
                    });
                }
                if (plantsTbody) {
                    plantsTbody.querySelectorAll('button[data-action="delete-plant"]').forEach((btn, idx) => {
                        btn.addEventListener('click', () => {
                            const { plants } = readState();
                            plants.splice(idx, 1);
                            setSizingPlants(project, plants);
                            renderPlants();
                            wireSystemAndPlantActions();
                        });
                    });
                }
            }

            // Initial render
            renderZones();
            renderSystems();
            renderPlants();
            wireSystemAndPlantActions();

            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    try {
                        const zones = collectZonesFromUI();
                        const systems = collectSystemsFromUI();
                        const plants = collectPlantsFromUI();
                        setSizingZones(project, zones);
                        setSizingSystems(project, systems);
                        setSizingPlants(project, plants);
                        alert('HVAC Sizing configuration saved.');
                    } catch (err) {
                        console.error('HVACSizingManager: save failed', err);
                        alert('Failed to save HVAC Sizing configuration. Check console for details.');
                    }
                });
            }
        }
    ).catch((err) => {
        console.error('HVACSizingManager: failed to load config service', err);
    });

    return panel;
}

function createIdealLoadsManagerPanel() {
    const { config = {}, ep = {}, meta = {} } =
        (typeof window !== 'undefined' &&
            window.require &&
            (() => {
                try {
                    const { getConfig } = window.require('./energyplusConfigService.js');
                    return getConfig(project) || {};
                } catch (e) {
                    console.warn('[IdealLoadsManager] Failed to load energyplusConfigService, falling back', e);
                    return {};
                }
            })()) ||
        (() => {
            const metaLocal =
                (typeof project.getMetadata === 'function' && project.getMetadata()) ||
                project.metadata ||
                {};
            const epLocal = metaLocal.energyPlusConfig || metaLocal.energyplus || {};
            return { meta: metaLocal, ep: epLocal, config: epLocal };
        })();

    const panel = document.createElement('div');
    panel.id = 'panel-energyplus-ideal-loads';
    panel.className = 'floating-window ui-panel resizable-panel';

    panel.innerHTML = `
        <div class="window-header">
            <span>Thermostats & IdealLoads</span>
            <div class="window-controls">
                <div class="window-icon-max" title="Maximize/Restore"></div>
                <div class="collapse-icon" title="Minimize"></div>
                <div class="window-icon-close" title="Close"></div>
            </div>
        </div>
        <div class="window-content space-y-3">
            <div class="resize-handle-edge top"></div>
            <div class="resize-handle-edge right"></div>
            <div class="resize-handle-edge bottom"></div>
            <div class="resize-handle-edge left"></div>
            <div class="resize-handle-corner top-left"></div>
            <div class="resize-handle-corner top-right"></div>
            <div class="resize-handle-corner bottom-left"></div>
            <div class="resize-handle-corner bottom-right"></div>

            <p class="info-box !text-xs !py-1.5 !px-2">
                Configure global/per-zone thermostats and IdealLoads settings.
                Backed by <code>energyPlusConfig.thermostats</code> and <code>energyPlusConfig.idealLoads</code>.
                Ray-Modeler's EnergyPlus integration uses <code>ZoneHVAC:IdealLoadsAirSystem</code> plus standard
                zone controls only; system-level AirLoopHVAC/PlantLoop objects are intentionally not generated.
            </p>

            <!-- THERMOSTAT SETPOINTS -->
            <div class="space-y-1 border border-gray-700/70 rounded bg-black/40 p-2">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">Thermostat Setpoints</span>
                    <button class="btn btn-xxs btn-secondary" data-action="add-tstat-setpoint">+ Add Setpoint</button>
                </div>
                <div class="border border-gray-700/70 rounded bg-black/60 max-h-32 overflow-y-auto scrollable-panel-inner mt-1">
                    <table class="w-full text-xs">
                        <thead class="bg-black/40">
                            <tr>
                                <th class="px-1 py-1 text-left">Name</th>
                                <th class="px-1 py-1 text-left">Type</th>
                                <th class="px-1 py-1 text-left">Schedule(s)</th>
                                <th class="px-1 py-1 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="tstat-setpoints-tbody"></tbody>
                    </table>
                </div>
                <div class="text-xs text-[--text-secondary]">
                    Defines ThermostatSetpoint:SingleHeating / SingleCooling / SingleHeatingOrCooling / DualSetpoint
                    objects referenced by zone thermostat controls. Setpoints are stored under
                    <code>energyPlusConfig.thermostats</code> entries with <code>scope: "setpoint"</code>.
                </div>
            </div>

            <!-- ZONE THERMOSTAT CONTROLS -->
            <div class="space-y-1 border border-gray-700/70 rounded bg-black/40 p-2">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">Zone Thermostat Controls</span>
                </div>
                <div class="border border-gray-700/70 rounded bg-black/60 max-h-40 overflow-y-auto scrollable-panel-inner mt-1">
                    <table class="w-full text-xs">
                        <thead class="bg-black/40">
                            <tr>
                                <th class="px-1 py-1 text-left">Zone</th>
                                <th class="px-1 py-1 text-left">Control Type Schedule</th>
                                <th class="px-1 py-1 text-left">SingleHeat</th>
                                <th class="px-1 py-1 text-left">SingleCool</th>
                                <th class="px-1 py-1 text-left">SingleHeat/Cool</th>
                                <th class="px-1 py-1 text-left">DualSetpoint</th>
                            </tr>
                        </thead>
                        <tbody class="tstat-zone-controls-tbody"></tbody>
                    </table>
                </div>
                <div class="text-xs text-[--text-secondary]">
                    Select a Thermostat Setpoint for each zone (by type). These mappings are written to energyPlusConfig.thermostats
                    and used to generate ZoneControl:Thermostat objects. Blank cells inherit or skip control.
                </div>
            </div>

            <!-- GLOBAL IDEAL LOADS -->
            <div class="space-y-1 border border-gray-700/70 rounded bg-black/40 p-2">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">Global IdealLoads (Defaults)</span>
                </div>
                <div class="grid grid-cols-4 gap-2 text-xs mt-1">
                    <div>
                        <label class="label !text-xs">Availability Schedule</label>
                        <select class="w-full text-xs" data-field="il-global-avail"></select>
                    </div>
                    <div>
                        <label class="label !text-xs">Max Heat T [°C]</label>
                        <input type="number" class="w-full text-xs" data-field="il-global-maxHeatT" placeholder="50">
                    </div>
                    <div>
                        <label class="label !text-xs">Min Cool T [°C]</label>
                        <input type="number" class="w-full text-xs" data-field="il-global-minCoolT" placeholder="13">
                    </div>
                    <div>
                        <label class="label !text-xs">Heat Limit</label>
                        <select class="w-full text-xs" data-field="il-global-heatLimit">
                            <option value="">(default)</option>
                            <option value="NoLimit">NoLimit</option>
                            <option value="LimitFlowRate">LimitFlowRate</option>
                            <option value="LimitCapacity">LimitCapacity</option>
                            <option value="LimitFlowRateAndCapacity">LimitFlowRateAndCapacity</option>
                        </select>
                    </div>
                </div>
                <div class="grid grid-cols-4 gap-2 text-xs mt-1">
                    <div>
                        <label class="label !text-xs">Max Heat Flow [m³/s]</label>
                        <input type="number" step="0.001" class="w-full text-xs" data-field="il-global-maxHeatFlow">
                    </div>
                    <div>
                        <label class="label !text-xs">Max Heat Cap [W]</label>
                        <input type="number" class="w-full text-xs" data-field="il-global-maxHeatCap">
                    </div>
                    <div>
                        <label class="label !text-xs">Cool Limit</label>
                        <select class="w-full text-xs" data-field="il-global-coolLimit">
                            <option value="">(default)</option>
                            <option value="NoLimit">NoLimit</option>
                            <option value="LimitFlowRate">LimitFlowRate</option>
                            <option value="LimitCapacity">LimitCapacity</option>
                            <option value="LimitFlowRateAndCapacity">LimitFlowRateAndCapacity</option>
                        </select>
                    </div>
                    <div>
                        <label class="label !text-xs">Max Cool Flow [m³/s]</label>
                        <input type="number" step="0.001" class="w-full text-xs" data-field="il-global-maxCoolFlow">
                    </div>
                </div>
                <div class="grid grid-cols-4 gap-2 text-xs mt-1">
                    <div>
                        <label class="label !text-xs">Max Cool Cap [W]</label>
                        <input type="number" class="w-full text-xs" data-field="il-global-maxCoolCap">
                    </div>
                    <div>
                        <label class="label !text-xs">Dehum Type</label>
                        <select class="w-full text-xs" data-field="il-global-dehumType">
                            <option value="">(default)</option>
                            <option value="None">None</option>
                            <option value="ConstantSensibleHeatRatio">ConstantSensibleHeatRatio</option>
                            <option value="Humidistat">Humidistat</option>
                            <option value="ConstantSupplyHumidityRatio">ConstantSupplyHumidityRatio</option>
                        </select>
                    </div>
                    <div>
                        <label class="label !text-xs">Cool SHR</label>
                        <input type="number" step="0.01" class="w-full text-xs" data-field="il-global-coolSHR">
                    </div>
                    <div>
                        <label class="label !text-xs">Humid Type</label>
                        <select class="w-full text-xs" data-field="il-global-humType">
                            <option value="">(default)</option>
                            <option value="None">None</option>
                            <option value="Humidistat">Humidistat</option>
                            <option value="ConstantSupplyHumidityRatio">ConstantSupplyHumidityRatio</option>
                        </select>
                    </div>
                </div>
                <div class="grid grid-cols-4 gap-2 text-xs mt-1">
                    <div>
                        <label class="label !text-xs">OA Method</label>
                        <select class="w-full text-xs" data-field="il-global-oaMethod">
                            <option value="">(none)</option>
                            <option value="None">None</option>
                            <option value="Sum">Sum</option>
                            <option value="Flow/Person">Flow/Person</option>
                            <option value="Flow/Area">Flow/Area</option>
                        </select>
                    </div>
                    <div>
                        <label class="label !text-xs">OA L/s.person</label>
                        <input type="number" step="0.001" class="w-full text-xs" data-field="il-global-oaPP">
                    </div>
                    <div>
                        <label class="label !text-xs">OA L/s.m²</label>
                        <input type="number" step="0.001" class="w-full text-xs" data-field="il-global-oaPA">
                    </div>
                    <div>
                        <label class="label !text-xs">Heat Recovery</label>
                        <select class="w-full text-xs" data-field="il-global-hrType">
                            <option value="">(default)</option>
                            <option value="None">None</option>
                            <option value="Sensible">Sensible</option>
                            <option value="Enthalpy">Enthalpy</option>
                        </select>
                    </div>
                </div>
                <div class="grid grid-cols-4 gap-2 text-xs mt-1">
                    <div>
                        <label class="label !text-xs">HR Sens Eff</label>
                        <input type="number" step="0.01" class="w-full text-xs" data-field="il-global-hrSens">
                    </div>
                    <div>
                        <label class="label !text-xs">HR Lat Eff</label>
                        <input type="number" step="0.01" class="w-full text-xs" data-field="il-global-hrLat">
                    </div>
                </div>
                <div class="text-xs text-[--text-secondary]">
                    Values left blank use EnergyPlus defaults. These act as defaults for all zones unless overridden below.
                </div>
            </div>

            <!-- PER-ZONE IDEAL LOADS -->
            <div class="space-y-1 border border-gray-700/70 rounded bg-black/40 p-2">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">Per-Zone IdealLoads Overrides</span>
                </div>
                <div class="border border-gray-700/70 rounded bg-black/60 max-h-40 overflow-y-auto **scrollable-panel-inner** mt-1">
                    <table class="w-full text-xs">
                        <thead class="bg-black/40">
                            <tr>
                                <th class="px-1 py-1 text-left">Zone</th>
                                <th class="px-1 py-1 text-left">Avail</th>
                                <th class="px-1 py-1 text-left">Heat Limit / Cap / Flow</th>
                                <th class="px-1 py-1 text-left">Cool Limit / Cap / Flow</th>
                                <th class="px-1 py-1 text-left">Dehum/Hum</th>
                                <th class="px-1 py-1 text-left">OA Method / Flows</th>
                                <th class="px-1 py-1 text-left">HR Type/Eff</th>
                            </tr>
                        </thead>
                        <tbody class="ideal-perzone-tbody"></tbody>
                    </table>
                </div>
                <div class="flex justify-end gap-2 mt-2">
                    <button class="btn btn-xxs btn-secondary" data-action="save-ideal-loads">
                        Save Thermostats & IdealLoads
                    </button>
                </div>
                <div class="text-xs text-[--text-secondary]">
                    Blank cells inherit from Global IdealLoads. This configuration is emitted into ZoneControl:Thermostat and ZoneHVAC:IdealLoadsAirSystem.
                </div>
            </div>

            <!-- GLOBAL THERMOSTATS -->
            <div class="space-y-1 border border-gray-700/70 rounded bg-black/40 p-2">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">Global Thermostat Schedules</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-xs mt-1">
                    <div>
                        <label class="label !text-xs">Heating Schedule</label>
                        <select class="w-full text-xs" data-field="globalHeatSched"></select>
                    </div>
                    <div>
                        <label class="label !text-xs">Cooling Schedule</label>
                        <select class="w-full text-xs" data-field="globalCoolSched"></select>
                    </div>
                </div>
            </div>

            <!-- PER-ZONE THERMOSTATS -->
            <div class="space-y-1 border border-gray-700/70 rounded bg-black/40 p-2">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">Per-Zone Thermostat Overrides</span>
                </div>
                <div class="max-h-40 overflow-y-auto **scrollable-panel-inner**">
                    <table class="w-full text-xs">
                        <thead class="bg-black/40">
                            <tr>
                                <th class="px-1 py-1 text-left">Zone</th>
                                <th class="px-1 py-1 text-left">Heat Sched (override)</th>
                                <th class="px-1 py-1 text-left">Cool Sched (override)</th>
                            </tr>
                        </thead>
                        <tbody class="tstats-tbody"></tbody>
                    </table>
                </div>
                <div class="text-xs text-[--text-secondary]">
                    Leave blank to use global schedules or no control.
                </div>
            </div>

            <!-- GLOBAL IDEALLOADS -->
            <div class="space-y-1 border border-gray-700/70 rounded bg-black/40 p-2">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">Global IdealLoads Settings</span>
                </div>
                <div class="grid grid-cols-4 gap-2 text-xs mt-1">
                    <div>
                        <label class="label !text-xs">Avail. Schedule</label>
                        <select class="w-full text-xs" data-field="il-global-avail"></select>
                    </div>
                    <div>
                        <label class="label !text-xs">Heat Cap [W]</label>
                        <input type="number" class="w-full text-xs" data-field="il-global-heatcap">
                    </div>
                    <div>
                        <label class="label !text-xs">Cool Cap [W]</label>
                        <input type="number" class="w-full text-xs" data-field="il-global-coolcap">
                    </div>
                    <div>
                        <label class="label !text-xs">OA Method</label>
                        <select class="w-full text-xs" data-field="il-global-oamethod">
                            <option value="">(none)</option>
                            <option value="None">None</option>
                            <option value="Sum">Sum</option>
                            <option value="Flow/Person">Flow/Person</option>
                            <option value="Flow/Area">Flow/Area</option>
                        </select>
                    </div>
                </div>
                <div class="grid grid-cols-4 gap-2 text-xs mt-1">
                    <div>
                        <label class="label !text-xs">OA L/s.person</label>
                        <input type="number" step="0.001" class="w-full text-xs" data-field="il-global-oaperperson">
                    </div>
                    <div>
                        <label class="label !text-xs">OA L/s.m²</label>
                        <input type="number" step="0.001" class="w-full text-xs" data-field="il-global-oaperarea">
                    </div>
                </div>
                <div class="text-xs text-[--text-secondary]">
                    OA flows are stored in m³/s in metadata; values here are in L/s and converted.
                </div>
            </div>

            <!-- PER-ZONE IDEALLOADS -->
            <div class="space-y-1 border border-gray-700/70 rounded bg-black/40 p-2">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">Per-Zone IdealLoads Overrides</span>
                </div>
                <div class="border border-gray-700/70 rounded bg-black/60 max-h-40 overflow-y-auto scrollable-panel-inner mt-1">
                    <table class="w-full text-xs">
                        <thead class="bg-black/40">
                            <tr>
                                <th class="px-1 py-1 text-left">Zone</th>
                                <th class="px-1 py-1 text-left">Avail. Sched</th>
                                <th class="px-1 py-1 text-left">Heat Cap [W]</th>
                                <th class="px-1 py-1 text-left">Cool Cap [W]</th>
                                <th class="px-1 py-1 text-left">OA Method</th>
                                <th class="px-1 py-1 text-left">OA L/s.person</th>
                                <th class="px-1 py-1 text-left">OA L/s.m²</th>
                            </tr>
                        </thead>
                        <tbody class="ideal-perzone-tbody"></tbody>
                    </table>
                </div>
                <div class="text-xs text-[--text-secondary] mt-1">
                    Blank cells inherit from Global IdealLoads. OA flows are entered in L/s and stored internally in m³/s.
                </div>
            </div>

            <div class="flex justify-end gap-2">
                <button class="btn btn-xxs btn-secondary" data-action="save-ideal-loads">Save Thermostats & IdealLoads</button>
            </div>
        </div>
    `;

    if (typeof window !== 'undefined' && window.initializePanelControls) {
        window.initializePanelControls(panel);
    } else {
        const closeButton = panel.querySelector('.window-icon-close');
        if (closeButton) {
            closeButton.onclick = () => panel.classList.add('hidden');
        }
    }

    const tstatSetpointsTbody = panel.querySelector('.tstat-setpoints-tbody');
    const tstatsTbody = panel.querySelector('.tstats-tbody');
    const tstatZoneControlsTbody = panel.querySelector('.tstat-zone-controls-tbody');
    const idealPerZoneTbody = panel.querySelector('.ideal-perzone-tbody');
    const saveBtn = panel.querySelector('[data-action="save-ideal-loads"]');

    function getMetaEp() {
        // Prefer already-normalized config from energyplusConfigService (inferred above)
        if (config && Object.keys(config).length) {
            return {
                meta: meta || {},
                ep: ep || {},
                config,
            };
        }

        const metaLocal =
            (typeof project.getMetadata === 'function' && project.getMetadata()) ||
            project.metadata ||
            {};
        const epLocal = metaLocal.energyPlusConfig || metaLocal.energyplus || {};
        return { meta: metaLocal, ep: epLocal, config: epLocal };
    }

    function getZones() {
        let zones = [];
        if (typeof project.getZones === 'function') {
            zones = project.getZones() || [];
        } else if (Array.isArray(project.zones)) {
            zones = project.zones;
        }
        if (!Array.isArray(zones) || !zones.length) {
            return [{ name: 'Zone_1' }];
        }
        return zones.map((z, i) => ({
            name: z.name || `Zone_${i + 1}`,
        }));
    }

    function getScheduleNames(ep) {
        const names = new Set([
            'RM_AlwaysOn',
            'RM_Office_Occ',
            'RM_Office_Lighting',
            'RM_Office_Equipment',
        ]);
        const sc = ep.schedules && ep.schedules.compact;
        if (Array.isArray(sc)) {
            sc.forEach((s) => {
                if (s && s.name) names.add(String(s.name));
            });
        } else if (sc && typeof sc === 'object') {
            Object.keys(sc).forEach((nm) => names.add(nm));
        }
        return Array.from(names);
    }

    function buildState(ep, configOverride) {
        const zones = getZones();
        const sourceEp = ep || {};
        const sourceCfg = configOverride || config || sourceEp;
        const schedNames = getScheduleNames(sourceEp);

        // Thermostats (zone mappings)
        let globalT = { heatingScheduleName: '', coolingScheduleName: '' };
        const perZoneT = new Map();
        const thermostatSource = Array.isArray(sourceCfg.thermostats)
            ? sourceCfg.thermostats
            : Array.isArray(sourceEp.thermostats)
                ? sourceEp.thermostats
                : [];

        thermostatSource.forEach((t) => {
            if (!t || t.scope === 'setpoint') return; // skip setpoint definitions
            const zn = (t.zoneName || '').toString();
            if (!zn || zn.toUpperCase() === 'GLOBAL') {
                if (!globalT) globalT = {};
                if (t.heatingScheduleName) globalT.heatingScheduleName = t.heatingScheduleName;
                if (t.coolingScheduleName) globalT.coolingScheduleName = t.coolingScheduleName;
            } else {
                perZoneT.set(zn, {
                    zoneName: zn,
                    controlTypeSchedule: t.controlTypeSchedule || '',
                    singleHeatingSetpoint: t.singleHeatingSetpoint || '',
                    singleCoolingSetpoint: t.singleCoolingSetpoint || '',
                    singleHeatCoolSetpoint: t.singleHeatCoolSetpoint || '',
                    dualSetpoint: t.dualSetpoint || '',
                });
            }
        });

        // IdealLoads
        const ideal = (sourceCfg && sourceCfg.idealLoads) || sourceEp.idealLoads || {};
        const g = ideal.global || {};
        const perZoneIdeal = new Map();
        if (Array.isArray(ideal.perZone)) {
            ideal.perZone.forEach((cfg) => {
                if (cfg && cfg.zoneName) {
                    perZoneIdeal.set(String(cfg.zoneName), { ...cfg });
                }
            });
        }

        return { zones, schedNames, globalT, perZoneT, idealGlobal: g, perZoneIdeal };
    }

    function getThermostatSetpoints(ep) {
        const raw = ep && Array.isArray(ep.thermostatSetpoints)
            ? ep.thermostatSetpoints
            : [];
        return raw
            .filter((sp) => sp && typeof sp.name === 'string' && sp.name.trim())
            .map((sp) => ({
                name: sp.name.trim(),
                type: sp.type || 'DualSetpoint',
                heatingScheduleName: sp.heatingScheduleName || '',
                coolingScheduleName: sp.coolingScheduleName || '',
                singleScheduleName: sp.singleScheduleName || '',
            }));
    }

    function renderThermostatSetpoints(ep, state) {
        if (!tstatSetpointsTbody) return;

        tstatSetpointsTbody.innerHTML = '';

        const setpoints = getThermostatSetpoints(ep);

        const schedOptions = (selected) => {
            let html = '<option value="">(none)</option>';
            state.schedNames.forEach((nm) => {
                const sel = nm === selected ? ' selected' : '';
                html += `<option value="${nm}"${sel}>${nm}</option>`;
            });
            return html;
        };

        if (!setpoints.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-1 py-1 text-xs text-white" colspan="4">
                    No thermostat setpoints defined. Click "Add Setpoint" to create one.
                </td>
            `;
            tstatSetpointsTbody.appendChild(tr);
        } else {
            setpoints.forEach((sp, index) => {
                const type = sp.type || 'DualSetpoint';
                const tr = document.createElement('tr');
                tr.dataset.index = String(index);
                tr.innerHTML = `
                    <td class="px-1 py-1 align-top">
                        <input class="w-full text-xs" data-field="name" value="${sp.name || ''}">
                    </td>
                    <td class="px-1 py-1 align-top">
                        <select class="w-full text-xs" data-field="type">
                            <option value="SingleHeating"${type === 'SingleHeating' ? ' selected' : ''}>SingleHeating</option>
                            <option value="SingleCooling"${type === 'SingleCooling' ? ' selected' : ''}>SingleCooling</option>
                            <option value="SingleHeatingOrCooling"${type === 'SingleHeatingOrCooling' ? ' selected' : ''}>SingleHeatingOrCooling</option>
                            <option value="DualSetpoint"${type === 'DualSetpoint' || !type ? ' selected' : ''}>DualSetpoint</option>
                        </select>
                    </td>
                    <td class="px-1 py-1 align-top">
                        <div class="grid grid-cols-2 gap-0.5">
                            <div>
                                <div class="text-[6px] text-[--text-secondary]">Heat / Single</div>
                                <select class="w-full text-xs" data-field="heatSched">
                                    ${schedOptions(sp.heatingScheduleName || sp.singleScheduleName || '')}
                                </select>
                            </div>
                            <div>
                                <div class="text-[6px] text-[--text-secondary]">Cool</div>
                                <select class="w-full text-xs" data-field="coolSched">
                                    ${schedOptions(sp.coolingScheduleName || '')}
                                </select>
                            </div>
                        </div>
                    </td>
                    <td class="px-1 py-1 align-top text-right">
                        <button class="btn btn-xxs btn-danger" data-action="delete-setpoint">Delete</button>
                    </td>
                `;
                tstatSetpointsTbody.appendChild(tr);
            });
        }

        // Wire delete buttons
        tstatSetpointsTbody
            .querySelectorAll('button[data-action="delete-setpoint"]')
            .forEach((btn) => {
                btn.addEventListener('click', () => {
                    const row = btn.closest('tr');
                    if (!row) return;
                    row.remove();
                });
            });
    }

    function fillGlobalThermostatUI(ep, state) {
        const heatSel = panel.querySelector('[data-field="globalHeatSched"]');
        const coolSel = panel.querySelector('[data-field="globalCoolSched"]');
        if (!heatSel || !coolSel) return;
        const addOptions = (sel, selected) => {
            sel.innerHTML = '<option value="">(none)</option>';
            state.schedNames.forEach((nm) => {
                const opt = document.createElement('option');
                opt.value = nm;
                opt.textContent = nm;
                if (nm === selected) opt.selected = true;
                sel.appendChild(opt);
            });
        };
        addOptions(heatSel, state.globalT.heatingScheduleName || '');
        addOptions(coolSel, state.globalT.coolingScheduleName || '');
    }

    function renderPerZoneThermostats(ep, state) {
        if (!tstatZoneControlsTbody) return;
        tstatZoneControlsTbody.innerHTML = '';

        const setpoints = getThermostatSetpoints(ep);

        const controlTypeSchedOptions = (selected) => {
            let html = '<option value="">(none)</option>';
            state.schedNames.forEach((nm) => {
                const sel = nm === selected ? ' selected' : '';
                html += `<option value="${nm}"${sel}>${nm}</option>`;
            });
            return html;
        };

        const setpointOptions = (selectedName, allowedTypes) => {
            let html = '<option value="">(none)</option>';
            setpoints.forEach((sp) => {
                if (!allowedTypes || allowedTypes.includes(sp.type || 'DualSetpoint')) {
                    const sel = sp.name === selectedName ? ' selected' : '';
                    html += `<option value="${sp.name}"${sel}>${sp.name}</option>`;
                }
            });
            return html;
        };

        state.zones.forEach((z) => {
            const zn = String(z.name);
            const existing = state.perZoneT.get(zn) || {};
            const tr = document.createElement('tr');
            tr.dataset.zoneName = zn;
            tr.innerHTML = `
                <td class="px-1 py-1 align-top text-[--accent-color]">${zn}</td>
                <td class="px-1 py-1 align-top">
                    <select class="w-full text-xs" data-field="ctrlSched">
                        ${controlTypeSchedOptions(existing.controlTypeSchedule || '')}
                    </select>
                </td>
                <td class="px-1 py-1 align-top">
                    <select class="w-full text-xs" data-field="singleHeat">
                        ${setpointOptions(existing.singleHeatingSetpoint || '', ['SingleHeating'])}
                    </select>
                </td>
                <td class="px-1 py-1 align-top">
                    <select class="w-full text-xs" data-field="singleCool">
                        ${setpointOptions(existing.singleCoolingSetpoint || '', ['SingleCooling'])}
                    </select>
                </td>
                <td class="px-1 py-1 align-top">
                    <select class="w-full text-xs" data-field="singleHeatCool">
                        ${setpointOptions(existing.singleHeatCoolSetpoint || '', ['SingleHeatingOrCooling'])}
                    </select>
                </td>
                <td class="px-1 py-1 align-top">
                    <select class="w-full text-xs" data-field="dual">
                        ${setpointOptions(existing.dualSetpoint || '', ['DualSetpoint'])}
                    </select>
                </td>
            `;
            tstatZoneControlsTbody.appendChild(tr);
        });

        // Backwards compatibility UI (legacy per-zone heat/cool schedule overrides)
        if (tstatsTbody) {
            tstatsTbody.innerHTML = '';
            const schedOptions = (selected) => {
                let html = '<option value="">(inherit)</option>';
                state.schedNames.forEach((nm) => {
                    const sel = nm === selected ? ' selected' : '';
                    html += `<option value="${nm}"${sel}>${nm}</option>`;
                });
                return html;
            };
            state.zones.forEach((z) => {
                const zn = String(z.name);
                const legacy = state.perZoneT.get(zn) || {};
                const tr = document.createElement('tr');
                tr.dataset.zoneName = zn;
                tr.innerHTML = `
                    <td class="px-1 py-1 align-top text-[--accent-color]">${zn}</td>
                    <td class="px-1 py-1 align-top">
                        <select class="w-full text-xs" data-field="heatSched">${schedOptions(legacy.heatingScheduleName || '')}</select>
                    </td>
                    <td class="px-1 py-1 align-top">
                        <select class="w-full text-xs" data-field="coolSched">${schedOptions(legacy.coolingScheduleName || '')}</select>
                    </td>
                `;
                tstatsTbody.appendChild(tr);
            });
        }
    }

    function fillGlobalIdealUI(ep, state) {
        const availSel = panel.querySelector('[data-field="il-global-avail"]');
        const heatCapInput = panel.querySelector('[data-field="il-global-heatcap"]');
        const coolCapInput = panel.querySelector('[data-field="il-global-coolcap"]');
        const oaMethodSel = panel.querySelector('[data-field="il-global-oamethod"]');
        const oaPerPersonInput = panel.querySelector('[data-field="il-global-oaperperson"]');
        const oaPerAreaInput = panel.querySelector('[data-field="il-global-oaperarea"]');
        if (!availSel || !heatCapInput || !coolCapInput || !oaMethodSel || !oaPerPersonInput || !oaPerAreaInput) return;

        // availability schedule options
        availSel.innerHTML = '<option value="">(none)</option>';
        state.schedNames.forEach((nm) => {
            const opt = document.createElement('option');
            opt.value = nm;
            opt.textContent = nm;
            if (nm === state.idealGlobal.availabilitySchedule) opt.selected = true;
            availSel.appendChild(opt);
        });

        heatCapInput.value = state.idealGlobal.maxHeatingCapacity ?? '';
        coolCapInput.value = state.idealGlobal.maxCoolingCapacity ?? '';
        oaMethodSel.value = state.idealGlobal.outdoorAirMethod || '';

        oaPerPersonInput.value =
            state.idealGlobal.outdoorAirFlowPerPerson != null
                ? (state.idealGlobal.outdoorAirFlowPerPerson * 1000.0).toString()
                : '';
        oaPerAreaInput.value =
            state.idealGlobal.outdoorAirFlowPerArea != null
                ? (state.idealGlobal.outdoorAirFlowPerArea * 1000.0).toString()
                : '';
    }

    function renderPerZoneIdeal(state) {
        if (!idealPerZoneTbody) return;

        idealPerZoneTbody.innerHTML = '';

        const schedOptions = (selected) => {
            let html = '<option value="">(inherit/global)</option>';
            state.schedNames.forEach((nm) => {
                const sel = nm === selected ? ' selected' : '';
                html += `<option value="${nm}"${sel}>${nm}</option>`;
            });
            return html;
        };

        const oaMethodOptions = (selected) => {
            const methods = ['', 'None', 'Sum', 'Flow/Person', 'Flow/Area'];
            return methods
                .map((m) => {
                    const label = m || '(inherit/global)';
                    const sel = m === selected ? ' selected' : '';
                    return `<option value="${m}"${sel}>${label}</option>`;
                })
                .join('');
        };

        state.zones.forEach((z) => {
            const zn = String(z.name);
            const cfg = state.perZoneIdeal.get(zn) || {};
            const tr = document.createElement('tr');
            tr.dataset.zoneName = zn;

            const heatCap = cfg.maxHeatingCapacity != null ? cfg.maxHeatingCapacity : '';
            const coolCap = cfg.maxCoolingCapacity != null ? cfg.maxCoolingCapacity : '';
            const oaMethod = cfg.outdoorAirMethod || '';
            const oaPP_Ls =
                cfg.outdoorAirFlowPerPerson != null
                    ? (cfg.outdoorAirFlowPerPerson * 1000.0).toString()
                    : '';
            const oaPA_Ls =
                cfg.outdoorAirFlowPerArea != null
                    ? (cfg.outdoorAirFlowPerArea * 1000.0).toString()
                    : '';

            tr.innerHTML = `
                <td class="px-1 py-1 align-top text-[--accent-color]">${zn}</td>
                <td class="px-1 py-1 align-top">
                    <select class="w-full text-xs" data-field="il-avail">
                        ${schedOptions(cfg.availabilitySchedule || '')}
                    </select>
                </td>
                <td class="px-1 py-1 align-top">
                    <input type="number" class="w-full text-xs" data-field="il-heatcap" value="${heatCap}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input type="number" class="w-full text-xs" data-field="il-coolcap" value="${coolCap}">
                </td>
                <td class="px-1 py-1 align-top">
                    <select class="w-full text-xs" data-field="il-oamethod">
                        ${oaMethodOptions(oaMethod)}
                    </select>
                </td>
                <td class="px-1 py-1 align-top">
                    <input type="number" step="0.001" class="w-full text-xs" data-field="il-oaperperson" value="${oaPP_Ls}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input type="number" step="0.001" class="w-full text-xs" data-field="il-oaperarea" value="${oaPA_Ls}">
                </td>
            `;
            idealPerZoneTbody.appendChild(tr);
        });
    }

    function collectAndSave() {
        const { meta, ep } = getMetaEp();
        const state = buildState(ep);
        const zones = state.zones.map((z) => z.name);
        const zoneSet = new Set(zones);

        // Collect thermostat setpoints (scope: "setpoint")
        const nextThermostats = [];

        if (tstatSetpointsTbody) {
            tstatSetpointsTbody.querySelectorAll('tr').forEach((tr) => {
                // Skip placeholder rows
                if (tr.querySelector('td[colspan]')) return;

                const name = (tr.querySelector('[data-field="name"]')?.value || '').trim();
                if (!name) return;

                const type = (tr.querySelector('[data-field="type"]')?.value || 'DualSetpoint').trim();
                const heatSched = (tr.querySelector('[data-field="heatSched"]')?.value || '').trim();
                const coolSched = (tr.querySelector('[data-field="coolSched"]')?.value || '').trim();

                const sp = {
                    scope: 'setpoint',
                    name,
                    type,
                };

                if (type === 'SingleHeating') {
                    if (!heatSched) return;
                    sp.heatingScheduleName = heatSched;
                } else if (type === 'SingleCooling') {
                    if (!coolSched) return;
                    sp.coolingScheduleName = coolSched;
                } else if (type === 'SingleHeatingOrCooling') {
                    if (!heatSched && !coolSched) return;
                    // For single heating/cooling we allow referencing one schedule; prefer heatSched if set.
                    if (heatSched) {
                        sp.singleScheduleName = heatSched;
                    } else if (coolSched) {
                        sp.singleScheduleName = coolSched;
                    }
                } else {
                    // DualSetpoint
                    if (!heatSched || !coolSched) return;
                    sp.heatingScheduleName = heatSched;
                    sp.coolingScheduleName = coolSched;
                }

                nextThermostats.push(sp);
            });
        }

        // Collect global thermostats
        const heatSel = panel.querySelector('[data-field="globalHeatSched"]');
        const coolSel = panel.querySelector('[data-field="globalCoolSched"]');
        const globalHeat = (heatSel?.value || '').trim();
        const globalCool = (coolSel?.value || '').trim();

        const thermostats = [];

        if (globalHeat || globalCool) {
            thermostats.push({
                zoneName: 'GLOBAL',
                heatingScheduleName: globalHeat || undefined,
                coolingScheduleName: globalCool || undefined,
            });
        }

        // Collect per-zone ThermostatSetpoint mappings from Zone Thermostat Controls
        if (tstatZoneControlsTbody) {
            tstatZoneControlsTbody.querySelectorAll('tr[data-zone-name]').forEach((tr) => {
                const zn = tr.dataset.zoneName;
                if (!zn || !zoneSet.has(zn)) return;

                const controlTypeSchedule = (tr.querySelector('[data-field="ctrlSched"]')?.value || '').trim();
                const singleHeat = (tr.querySelector('[data-field="singleHeat"]')?.value || '').trim();
                const singleCool = (tr.querySelector('[data-field="singleCool"]')?.value || '').trim();
                const singleHC = (tr.querySelector('[data-field="singleHeatCool"]')?.value || '').trim();
                const dual = (tr.querySelector('[data-field="dual"]')?.value || '').trim();

                if (controlTypeSchedule || singleHeat || singleCool || singleHC || dual) {
                    thermostats.push({
                        zoneName: zn,
                        controlTypeSchedule: controlTypeSchedule || undefined,
                        singleHeatingSetpoint: singleHeat || undefined,
                        singleCoolingSetpoint: singleCool || undefined,
                        singleHeatCoolSetpoint: singleHC || undefined,
                        dualSetpoint: dual || undefined,
                    });
                }
            });
        }

        // Backwards-compatible per-zone overrides table (if present)
        if (tstatsTbody) {
            tstatsTbody.querySelectorAll('tr[data-zone-name]').forEach((tr) => {
                const zn = tr.dataset.zoneName;
                if (!zn || !zoneSet.has(zn)) return;
                const heat = (tr.querySelector('[data-field="heatSched"]')?.value || '').trim();
                const cool = (tr.querySelector('[data-field="coolSched"]')?.value || '').trim();
                if (heat || cool) {
                    thermostats.push({
                        zoneName: zn,
                        heatingScheduleName: heat || undefined,
                        coolingScheduleName: cool || undefined,
                    });
                }
            });
        }

        // Collect global IdealLoads
        const availSel = panel.querySelector('[data-field="il-global-avail"]');
        const heatCapInput = panel.querySelector('[data-field="il-global-heatcap"]');
        const coolCapInput = panel.querySelector('[data-field="il-global-coolcap"]');
        const oaMethodSel = panel.querySelector('[data-field="il-global-oamethod"]');
        const oaPerPersonInput = panel.querySelector('[data-field="il-global-oaperperson"]');
        const oaPerAreaInput = panel.querySelector('[data-field="il-global-oaperarea"]');

        const idealGlobal = {};

        if (availSel && availSel.value) {
            idealGlobal.availabilitySchedule = availSel.value;
        }

        const gHeatCap = parseFloat(heatCapInput?.value || '');
        if (Number.isFinite(gHeatCap)) {
            idealGlobal.heatingLimitType = 'LimitCapacity';
            idealGlobal.maxHeatingCapacity = gHeatCap;
        }

        const gCoolCap = parseFloat(coolCapInput?.value || '');
        if (Number.isFinite(gCoolCap)) {
            idealGlobal.coolingLimitType = 'LimitCapacity';
            idealGlobal.maxCoolingCapacity = gCoolCap;
        }

        const gOaMethod = oaMethodSel?.value || '';
        if (gOaMethod) {
            idealGlobal.outdoorAirMethod = gOaMethod;
        }

        const gOaPerPerson_Ls = parseFloat(oaPerPersonInput?.value || '');
        if (Number.isFinite(gOaPerPerson_Ls) && gOaPerPerson_Ls > 0) {
            idealGlobal.outdoorAirFlowPerPerson = gOaPerPerson_Ls / 1000.0;
        }

        const gOaPerArea_Ls = parseFloat(oaPerAreaInput?.value || '');
        if (Number.isFinite(gOaPerArea_Ls) && gOaPerArea_Ls > 0) {
            idealGlobal.outdoorAirFlowPerArea = gOaPerArea_Ls / 1000.0;
        }

        // Collect per-zone IdealLoads overrides
        const perZoneIdeal = [];
        idealPerZoneTbody.querySelectorAll('tr[data-zone-name]').forEach((tr) => {
            const zn = tr.dataset.zoneName;
            if (!zn || !zoneSet.has(zn)) return;

            const avail = (tr.querySelector('[data-field="il-avail"]')?.value || '').trim();
            const heatCap = parseFloat(
                tr.querySelector('[data-field="il-heatcap"]')?.value || ''
            );
            const coolCap = parseFloat(
                tr.querySelector('[data-field="il-coolcap"]')?.value || ''
            );
            const oaMethod = (tr.querySelector('[data-field="il-oamethod"]')?.value || '').trim();
            const oaPerPerson_Ls = parseFloat(
                tr.querySelector('[data-field="il-oaperperson"]')?.value || ''
            );
            const oaPerArea_Ls = parseFloat(
                tr.querySelector('[data-field="il-oaperarea"]')?.value || ''
            );

            const cfg = { zoneName: zn };
            let has = false;

            if (avail) {
                cfg.availabilitySchedule = avail;
                has = true;
            }
            if (Number.isFinite(heatCap)) {
                cfg.heatingLimitType = 'LimitCapacity';
                cfg.maxHeatingCapacity = heatCap;
                has = true;
            }
            if (Number.isFinite(coolCap)) {
                cfg.coolingLimitType = 'LimitCapacity';
                cfg.maxCoolingCapacity = coolCap;
                has = true;
            }
            if (oaMethod) {
                cfg.outdoorAirMethod = oaMethod;
                has = true;
            }
            if (Number.isFinite(oaPerPerson_Ls) && oaPerPerson_Ls > 0) {
                cfg.outdoorAirFlowPerPerson = oaPerPerson_Ls / 1000.0;
                has = true;
            }
            if (Number.isFinite(oaPerArea_Ls) && oaPerArea_Ls > 0) {
                cfg.outdoorAirFlowPerArea = oaPerArea_Ls / 1000.0;
                has = true;
            }

            if (has) {
                perZoneIdeal.push(cfg);
            }
        });

        const idealLoads = {};
        if (Object.keys(idealGlobal).length) {
            idealLoads.global = idealGlobal;
        }
        if (perZoneIdeal.length) {
            idealLoads.perZone = perZoneIdeal;
        }

        // Merge existing non-setpoint thermostat records which are not overridden.
        const existing = Array.isArray(ep.thermostats) ? ep.thermostats : [];
        existing.forEach((t) => {
            if (!t || t.scope === 'setpoint') return;
            const zn = (t.zoneName || '').toString();
            if (
                zn === 'GLOBAL' &&
                thermostats.some((x) => x.zoneName === 'GLOBAL')
            ) {
                return;
            }
            if (
                zn &&
                zn !== 'GLOBAL' &&
                thermostats.some((x) => x.zoneName === zn)
            ) {
                return;
            }
            thermostats.push({ ...t });
        });

        // Prepend setpoint definitions so they are easy to find.
        const mergedThermostats = [...nextThermostats, ...thermostats];

        const nextEp = {
            ...ep,
            thermostats: mergedThermostats,
            idealLoads: idealLoads,
        };

        if (typeof project.updateMetadata === 'function') {
            project.updateMetadata({
                ...meta,
                energyPlusConfig: nextEp,
            });
        } else {
            project.metadata = {
                ...(project.metadata || meta),
                energyPlusConfig: nextEp,
            };
        }
    }

    function collectThermostatSetpointsFromUI() {
        if (!tstatSetpointsTbody) return [];

        const rows = Array.from(tstatSetpointsTbody.querySelectorAll('tr'));
        const setpoints = [];

        rows.forEach((tr) => {
            if (tr.querySelector('td[colspan]')) return;

            const name = (tr.querySelector('[data-field="name"]')?.value || '').trim();
            if (!name) return;

            const type = (tr.querySelector('[data-field="type"]')?.value || 'DualSetpoint').trim();
            const heatSched = (tr.querySelector('[data-field="heatSched"]')?.value || '').trim();
            const coolSched = (tr.querySelector('[data-field="coolSched"]')?.value || '').trim();

            const sp = { name, type };

            if (type === 'SingleHeating') {
                if (!heatSched) return;
                sp.heatingScheduleName = heatSched;
            } else if (type === 'SingleCooling') {
                if (!coolSched) return;
                sp.coolingScheduleName = coolSched;
            } else if (type === 'SingleHeatingOrCooling') {
                // Use either heat or cool schedule as single setpoint.
                if (!heatSched && !coolSched) return;
                sp.singleScheduleName = heatSched || coolSched;
            } else {
                // DualSetpoint
                if (!heatSched || !coolSched) return;
                sp.heatingScheduleName = heatSched;
                sp.coolingScheduleName = coolSched;
            }

            setpoints.push(sp);
        });

        return setpoints;
    }

    function renderAll() {
        const { ep } = getMetaEp();
        const state = buildState(ep);
        renderThermostatSetpoints(ep, state);
        fillGlobalThermostatUI(ep, state);
        renderPerZoneThermostats(ep, state);
        fillGlobalIdealUI(ep, state);
        renderPerZoneIdeal(state);

        // Ensure "Add Setpoint" is always wired once DOM is ready.
        const addBtn = panel.querySelector('[data-action="add-tstat-setpoint"]');
        if (addBtn && !addBtn._tstatSetpointBound) {
            addBtn._tstatSetpointBound = true;
            addBtn.addEventListener('click', () => {
                if (!tstatSetpointsTbody) return;

                const stateNow = buildState(getMetaEp().ep);
                const schedOptions = (selected) => {
                    let html = '<option value="">(none)</option>';
                    stateNow.schedNames.forEach((nm) => {
                        const sel = nm === selected ? ' selected' : '';
                        html += `<option value="${nm}"${sel}>${nm}</option>`;
                    });
                    return html;
                };

                const first = tstatSetpointsTbody.children[0];
                if (first && first.querySelector && first.querySelector('td[colspan]')) {
                    tstatSetpointsTbody.innerHTML = '';
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="px-1 py-1 align-top">
                        <input class="w-full text-xs" data-field="name" placeholder="Setpoint name">
                    </td>
                    <td class="px-1 py-1 align-top">
                        <select class="w-full text-xs" data-field="type">
                            <option value="DualSetpoint" selected>DualSetpoint</option>
                            <option value="SingleHeating">SingleHeating</option>
                            <option value="SingleCooling">SingleCooling</option>
                            <option value="SingleHeatingOrCooling">SingleHeatingOrCooling</option>
                        </select>
                    </td>
                    <td class="px-1 py-1 align-top">
                        <div class="grid grid-cols-2 gap-0.5">
                            <div>
                                <div class="text-[6px] text-[--text-secondary]">Heat / Single</div>
                                <select class="w-full text-xs" data-field="heatSched">
                                    ${schedOptions('')}
                                </select>
                            </div>
                            <div>
                                <div class="text-[6px] text-[--text-secondary]">Cool</div>
                                <select class="w-full text-xs" data-field="coolSched">
                                    ${schedOptions('')}
                                </select>
                            </div>
                        </div>
                    </td>
                    <td class="px-1 py-1 align-top text-right">
                        <button class="btn btn-xxs btn-danger" data-action="delete-setpoint">Delete</button>
                    </td>
                `;
                tstatSetpointsTbody.appendChild(tr);

                const del = tr.querySelector('button[data-action="delete-setpoint"]');
                if (del) {
                    del.addEventListener('click', () => tr.remove());
                }
            });
        }
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            try {
                const setpoints = collectThermostatSetpointsFromUI();
                const { meta, ep } = getMetaEp();

                // Persist setpoints via service when available
                try {
                    if (window.require) {
                        const { setThermostatSetpoints } = window.require('./energyplusConfigService.js');
                        if (typeof setThermostatSetpoints === 'function') {
                            setThermostatSetpoints(project, setpoints);
                        } else {
                            throw new Error('setThermostatSetpoints not available');
                        }
                    } else {
                        throw new Error('window.require not available');
                    }
                } catch (err) {
                    console.warn('[IdealLoadsManager] setThermostatSetpoints via service failed, falling back', err);
                    const nextEp = { ...ep, thermostatSetpoints: setpoints };
                    if (typeof project.updateMetadata === 'function') {
                        project.updateMetadata({
                            ...meta,
                            energyPlusConfig: nextEp,
                        });
                    } else {
                        project.metadata = {
                            ...(project.metadata || meta),
                            energyPlusConfig: nextEp,
                        };
                    }
                }

                collectAndSave();
                alert('Thermostats & IdealLoads configuration saved.');
            } catch (err) {
                console.error('IdealLoadsManager: save failed', err);
                alert('Failed to save Thermostats & IdealLoads configuration. Check console for details.');
            }
        });
    }

    renderAll();

    return panel;
}

function openIdealLoadsManagerPanel() {
    const panelId = 'panel-energyplus-ideal-loads';
    let panel = document.getElementById(panelId);
    if (!panel) {
        panel = createIdealLoadsManagerPanel();
        document.getElementById('window-container').appendChild(panel);
    }
    panel.classList.remove('hidden');
    panel.style.zIndex = getNewZIndex();
}




function openShadingManagerPanel() {
    const panelId = 'panel-energyplus-shading';
    const btnId = 'toggle-panel-shading-btn';
    const dom = getDom();
    const btn = dom[btnId] || document.getElementById(btnId);

    let panel = document.getElementById(panelId);
    if (!panel) {
        panel = createShadingManagerPanel();
        document.getElementById('window-container').appendChild(panel);
    }

    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        panel.style.zIndex = getNewZIndex();
        if (btn) btn.classList.add('active');
    } else {
        panel.classList.add('hidden');
        if (btn) btn.classList.remove('active');
    }
}

/**
 * Shading & Solar Control Manager
 * Canonical schema (matches energyplusModelBuilder + energyplusConfigService.setShading):
 *
 *  shading: {
 *    siteSurfaces?: Array<{
 *      name: string,
 *      type?: 'Site' | 'Building',
 *      transmittanceScheduleName?: string,
 *      vertices: Array<{ x: number, y: number, z: number}>
 *}>,
 *    zoneSurfaces?: Array<{
 *      name: string,
 *      baseSurfaceName: string,
 *      transmittanceScheduleName?: string,
 *      vertices: Array<{ x: number, y: number, z: number}>
 *}>,
 *    reflectance?: Array<{
 *      shadingSurfaceName: string,
 *      solarReflectance?: number,
 *      visibleReflectance?: number,
 *      infraredHemisphericalEmissivity?: number,
 *      infraredTransmittance?: number
 *}>,
 *    windowShadingControls?: Array<{
 *      name: string,
 *      shadingType: string,
 *      controlType: string,
 *      scheduleName?: string,
 *      setpoint1?: number,
 *      setpoint2?: number,
 *      glareControlIsActive?: boolean,
 *      multipleSurfaceControlType?: string,
 *      fenestrationSurfaceNames: string[]
 *}>
 *}
 *
 * If shading is empty/missing, builder behavior is unchanged.
 */
function createShadingManagerPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-energyplus-shading';
    panel.className = 'floating-window ui-panel resizable-panel hidden'; // Added hidden class
    panel.style.width = '700px';
    panel.style.height = '550px';

    panel.innerHTML = `
        <div class="window-header">
            <span>Shading & Solar Control</span>
            <div class="window-controls">
                <div class="window-icon-max" title="Maximize/Restore"></div>
                <div class="collapse-icon" title="Minimize"></div>
                <div class="window-icon-close" title="Close"></div>
            </div>
        </div>
        <div class="window-content" style="display: flex; flex-direction: column; height: 100%; overflow: hidden;">
            <div class="resize-handle-edge top"></div>
            <div class="resize-handle-edge right"></div>
            <div class="resize-handle-edge bottom"></div>
            <div class="resize-handle-edge left"></div>
            <div class="resize-handle-corner top-left"></div>
            <div class="resize-handle-corner top-right"></div>
            <div class="resize-handle-corner bottom-left"></div>
            <div class="resize-handle-corner bottom-right"></div>

            <!-- New: Container for ShadingPanelUI -->
            <div id="shading-panel-ui-container" style="flex: 1; overflow: hidden; padding: 1rem;">
                <!-- ShadingPanelUI will render here -->
            </div>
        </div>
    `;

    if (typeof window !== 'undefined' && window.initializePanelControls) {
        window.initializePanelControls(panel);
    } else {
        const closeButton = panel.querySelector('.window-icon-close');
        if (closeButton) {
            closeButton.onclick = () => panel.classList.add('hidden');
        }
    }

    // Initialize the new ShadingPanelUI
    import('./ShadingPanelUI.js').then(module => {
        const { ShadingPanelUI } = module;
        const shadingPanelUI = new ShadingPanelUI('shading-panel-ui-container');
        shadingPanelUI.render();

        // Store reference for later access
        panel._shadingPanelUI = shadingPanelUI;

        // Refresh aperture list after a short delay to ensure geometry is created
        setTimeout(() => {
            console.log('[Shading Manager] Refreshing aperture list after delay...');
            shadingPanelUI.refresh();
        }, 200);
    }).catch(err => {
        console.error('Failed to load ShadingPanelUI:', err);
        const container = panel.querySelector('#shading-panel-ui-container');
        if (container) {
            container.innerHTML = `<div style="color: var(--text-error); padding: 2rem; text-align: center;">Failed to load shading panel UI: ${err.message}</div>`;
        }
    });

    // Old configuration code removed - now handled by ShadingPanelUI class
    return panel;
}
// --- WALL SHADING MANAGER (Ported from AperturePanelUI) ---
function renderWallShadingManager(container) {
    container.innerHTML = `
        <div class="flex flex-col h-full">
            <div class="mb-4 border-b border-gray-700 pb-2">
                <h3 class="font-semibold text-sm uppercase">Wall Shading Controls</h3>
                <p class="text-xs text-[--text-secondary] mt-1">Select an orientation to configure shading devices.</p>
            </div>
            
            <div class="flex space-x-2 mb-4">
                <button class="btn btn-sm btn-secondary active" data-orient="n">North</button>
                <button class="btn btn-sm btn-secondary" data-orient="s">South</button>
                <button class="btn btn-sm btn-secondary" data-orient="e">East</button>
                <button class="btn btn-sm btn-secondary" data-orient="w">West</button>
            </div>

            <div id="wall-shading-content" class="flex-1 overflow-y-auto pr-2">
                <!-- Content injected here -->
            </div>
        </div>
    `;

    const contentDiv = container.querySelector('#wall-shading-content');
    const orientBtns = container.querySelectorAll('[data-orient]');

    // Create containers for ALL orientations (hidden by default)
    ['n', 's', 'e', 'w'].forEach(dir => {
        const wrapper = document.createElement('div');
        wrapper.id = `wall-shading-wrapper-${dir}`;
        wrapper.className = dir === 'n' ? '' : 'hidden'; // Show North by default

        // Re-create the shading section logic
        const labelText = { n: 'North', s: 'South', e: 'East', w: 'West' }[dir];

        wrapper.innerHTML = `
            <div class="shading-section-container space-y-4">
                <h4 class="font-semibold text-sm uppercase text-gray-700">${labelText} Wall Shading</h4>
                <label class="flex items-center cursor-pointer" for="shading-${dir}-toggle">
                    <input type="checkbox" id="shading-${dir}-toggle">
                    <span class="ml-3 text-sm font-normal text-[--text-primary]">Enable Shading on this Wall</span>
                </label>
                
                <div id="shading-controls-${dir}" class="hidden space-y-5">
                    <div class="type-group">
                        <label class="label" for="shading-type-${dir}">Device Type</label>
                        <select id="shading-type-${dir}" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                            <option value="none">None</option>
                            <option value="overhang">Overhang</option>
                            <option value="lightshelf">Light Shelf</option>
                            <option value="louver">Louver</option>
                            <option value="roller">Roller</option>
                            <option value="imported_obj">Imported OBJ</option>
                        </select>
                    </div>
                </div>
            </div>
        `;

        // Append specific controls
        const controlsDiv = wrapper.querySelector(`#shading-controls-${dir}`);
        controlsDiv.appendChild(createOverhangControls(dir));
        controlsDiv.appendChild(createLightshelfControls(dir));
        controlsDiv.appendChild(createLouverControls(dir));
        controlsDiv.appendChild(createRollerControls(dir));
        controlsDiv.appendChild(createImportedObjControls(dir));

        contentDiv.appendChild(wrapper);
    });

    // Tab switching logic
    orientBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            orientBtns.forEach(b => b.classList.remove('active', 'btn-primary'));
            orientBtns.forEach(b => b.classList.add('btn-secondary'));
            btn.classList.add('active', 'btn-primary');
            btn.classList.remove('btn-secondary');

            const dir = btn.dataset.orient;
            ['n', 's', 'e', 'w'].forEach(d => {
                const el = container.querySelector(`#wall-shading-wrapper-${d}`);
                if (el) el.classList.toggle('hidden', d !== dir);
            });
        });
    });

    // Re-attach event listeners for the newly created elements
    // We need to call setupDOM() or similar to re-bind events if they were bound globally
    // But ui.js binds specific events. 
    // Since we are creating these elements dynamically, we might need to manually attach listeners 
    // OR rely on the fact that ui.js might have delegated listeners or we need to trigger a re-scan.
    // ui.js calls setupDOM() which caches IDs. 
    // We should probably trigger setupDOM() again? 
    // But setupDOM is imported from dom.js.
    // ui.js handles 'input' events globally for cached elements.

    // IMPORTANT: We need to ensure the toggle logic (showing/hiding controls) works.
    ['n', 's', 'e', 'w'].forEach(dir => {
        const toggle = container.querySelector(`#shading-${dir}-toggle`);
        const controls = container.querySelector(`#shading-controls-${dir}`);
        const typeSelect = container.querySelector(`#shading-type-${dir}`);

        if (toggle && controls) {
            toggle.addEventListener('change', () => {
                controls.classList.toggle('hidden', !toggle.checked);
            });
        }

        if (typeSelect) {
            typeSelect.addEventListener('change', () => {
                updateShadingTypeVisibility(dir, typeSelect.value);
            });
        }
    });
}

function updateShadingTypeVisibility(suffix, type) {
    const types = ['overhang', 'lightshelf', 'louver', 'roller', 'imported_obj'];
    types.forEach(t => {
        const el = document.getElementById(`shading-controls-${t}-${suffix}`);
        if (el) el.classList.toggle('hidden', t !== type);
    });
}

// Helper functions for controls (Ported from AperturePanelUI)
function createRangeControl(id, label, min, max, def, step, unit = '') {
    const div = document.createElement('div');
    div.innerHTML = `
        <div class="flex justify-between items-center mb-1">
            <label class="text-xs text-[--text-secondary]" for="${id}">${label}</label>
            <span class="text-xs font-mono text-[--accent-color]" id="${id}-val">${def}${unit}</span>
        </div>
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${def}" class="w-full accent-[--accent-color] h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer">
    `;

    // Add local listener to update value display
    const input = div.querySelector('input');
    const valDisplay = div.querySelector('span');
    input.addEventListener('input', (e) => {
        valDisplay.textContent = `${parseFloat(e.target.value)}${unit}`;
    });

    return div;
}

function createOverhangControls(suffix) {
    const div = document.createElement('div');
    div.id = `shading-controls-overhang-${suffix}`;
    div.className = 'hidden space-y-4 pt-4 border-t border-[--grid-color]';

    div.appendChild(createRangeControl(`overhang-dist-above-${suffix}`, 'Distance Above Top (m)', 0, 1.0, 0, 0.05, 'm'));
    div.appendChild(createRangeControl(`overhang-tilt-${suffix}`, 'Tilt Angle', 0, 180, 90, 1, '°'));
    div.appendChild(createRangeControl(`overhang-depth-${suffix}`, 'Depth (m)', 0, 2.0, 0.5, 0.1, 'm'));
    div.appendChild(createRangeControl(`overhang-thick-${suffix}`, 'Thickness (m)', 0.005, 0.5, 0.05, 0.005, 'm'));
    div.appendChild(createRangeControl(`overhang-left-extension-${suffix}`, 'Left Extension (m)', 0, 1.0, 0, 0.05, 'm'));
    div.appendChild(createRangeControl(`overhang-right-extension-${suffix}`, 'Right Extension (m)', 0, 1.0, 0, 0.05, 'm'));
    return div;
}

function createLightshelfControls(suffix) {
    const div = document.createElement('div');
    div.id = `shading-controls-lightshelf-${suffix}`;
    div.className = 'hidden space-y-4 pt-4 border-t border-[--grid-color]';

    div.innerHTML = `
        <div><label class="label">Placement</label>
        <div class="btn-group mt-1">
            <button id="lightshelf-placement-ext-${suffix}" class="btn active">Exterior</button>
            <button id="lightshelf-placement-int-${suffix}" class="btn">Interior</button>
            <button id="lightshelf-placement-both-${suffix}" class="btn">Both</button>
        </div></div>`;

    // Exterior Controls
    const extDiv = document.createElement('div');
    extDiv.id = `lightshelf-controls-ext-${suffix}`;
    extDiv.className = "space-y-4 pt-4 border-t border-dashed border-[--grid-color]";
    extDiv.innerHTML = `<h3 class="font-semibold text-xs uppercase text-[--text-secondary]">Exterior Shelf</h3>`;
    extDiv.appendChild(createRangeControl(`lightshelf-dist-below-ext-${suffix}`, 'Dist Below Top (m)', 0, 3.0, 0.2, 0.05, 'm'));
    extDiv.appendChild(createRangeControl(`lightshelf-tilt-ext-${suffix}`, 'Tilt Angle', -90, 90, 0, 1, '°'));
    extDiv.appendChild(createRangeControl(`lightshelf-depth-ext-${suffix}`, 'Depth (m)', 0, 2.0, 0.5, 0.1, 'm'));
    extDiv.appendChild(createRangeControl(`lightshelf-thick-ext-${suffix}`, 'Thickness (m)', 0.005, 0.5, 0.05, 0.005, 'm'));
    div.appendChild(extDiv);

    // Interior Controls
    const intDiv = document.createElement('div');
    intDiv.id = `lightshelf-controls-int-${suffix}`;
    intDiv.className = "hidden space-y-4 pt-4 border-t border-dashed border-[--grid-color]";
    intDiv.innerHTML = `<h3 class="font-semibold text-xs uppercase text-[--text-secondary]">Interior Shelf</h3>`;
    intDiv.appendChild(createRangeControl(`lightshelf-dist-below-int-${suffix}`, 'Dist Below Top (m)', 0, 3.0, 0.2, 0.05, 'm'));
    intDiv.appendChild(createRangeControl(`lightshelf-tilt-int-${suffix}`, 'Tilt Angle', -90, 90, 0, 1, '°'));
    intDiv.appendChild(createRangeControl(`lightshelf-depth-int-${suffix}`, 'Depth (m)', 0, 2.0, 0.5, 0.1, 'm'));
    intDiv.appendChild(createRangeControl(`lightshelf-thick-int-${suffix}`, 'Thickness (m)', 0.005, 0.5, 0.05, 0.005, 'm'));
    div.appendChild(intDiv);

    return div;
}

function createLouverControls(suffix) {
    const div = document.createElement('div');
    div.id = `shading-controls-louver-${suffix}`;
    div.className = 'hidden space-y-4 pt-4 border-t border-[--grid-color]';

    div.innerHTML = `
        <div><label class="label">Placement</label>
        <div class="btn-group mt-1">
            <button id="louver-placement-ext-${suffix}" class="btn active">Exterior</button>
            <button id="louver-placement-int-${suffix}" class="btn">Interior</button>
        </div></div>
        <div><label class="label" for="louver-slat-orientation-${suffix}">Orientation</label>
        <select id="louver-slat-orientation-${suffix}" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
            <option value="horizontal" selected>Horizontal</option>
            <option value="vertical">Vertical</option>
        </select></div>`;

    div.appendChild(createRangeControl(`louver-slat-width-${suffix}`, 'Slat Width (m)', 0.01, 1.0, 0.1, 0.01, 'm'));
    div.appendChild(createRangeControl(`louver-slat-sep-${suffix}`, 'Slat Separation (m)', 0, 0.5, 0.05, 0.01, 'm'));
    div.appendChild(createRangeControl(`louver-slat-thick-${suffix}`, 'Slat Thickness (m)', 0, 0.5, 0.01, 0.005, 'm'));
    div.appendChild(createRangeControl(`louver-slat-angle-${suffix}`, 'Slat Angle', -90, 90, 0, 1, '°'));
    div.appendChild(createRangeControl(`louver-dist-to-glass-${suffix}`, 'Dist to Glass (m)', 0, 1.0, 0.1, 0.01, 'm'));
    return div;
}

function createRollerControls(suffix) {
    const div = document.createElement('div');
    div.id = `shading-controls-roller-${suffix}`;
    div.className = 'hidden space-y-4 pt-4 border-t border-[--grid-color]';
    div.innerHTML = `<p class="info-box !text-xs !py-2 !px-3">Roller shades are placed internally.</p>`;

    div.innerHTML += `<h4 class="font-semibold text-xs uppercase text-[--text-secondary] pt-2">Sizing Offsets</h4>`;
    div.appendChild(createRangeControl(`roller-top-opening-${suffix}`, 'Top Opening (m)', -1.0, 1.0, 0.0, 0.01, 'm'));
    div.appendChild(createRangeControl(`roller-bottom-opening-${suffix}`, 'Bottom Opening (m)', -1.0, 1.0, 0.0, 0.01, 'm'));
    div.appendChild(createRangeControl(`roller-left-opening-${suffix}`, 'Left Opening (m)', -1.0, 1.0, 0.0, 0.01, 'm'));
    div.appendChild(createRangeControl(`roller-right-opening-${suffix}`, 'Right Opening (m)', -1.0, 1.0, 0.0, 0.01, 'm'));

    div.innerHTML += `<h4 class="font-semibold text-xs uppercase text-[--text-secondary] pt-2">Placement</h4>`;
    div.appendChild(createRangeControl(`roller-dist-to-glass-${suffix}`, 'Dist to Glass (m)', 0, 1.0, 0.1, 0.01, 'm'));

    div.innerHTML += `<h4 class="font-semibold text-xs uppercase text-[--text-secondary] pt-2">Physical Properties</h4>`;
    div.appendChild(createRangeControl(`roller-solar-trans-${suffix}`, 'Solar Transmittance', 0, 1, 0.1, 0.01));
    div.appendChild(createRangeControl(`roller-solar-refl-${suffix}`, 'Solar Reflectance', 0, 1, 0.7, 0.01));
    div.appendChild(createRangeControl(`roller-vis-trans-${suffix}`, 'Visible Transmittance', 0, 1, 0.05, 0.01));
    div.appendChild(createRangeControl(`roller-vis-refl-${suffix}`, 'Visible Reflectance', 0, 1, 0.7, 0.01));
    div.appendChild(createRangeControl(`roller-ir-emis-${suffix}`, 'IR Emissivity', 0, 1, 0.9, 0.01));
    div.appendChild(createRangeControl(`roller-ir-trans-${suffix}`, 'IR Transmittance', 0, 1, 0.0, 0.01));
    div.appendChild(createRangeControl(`roller-thickness-${suffix}`, 'Thickness (m)', 0, 0.05, 0.001, 0.001, 'm'));
    div.appendChild(createRangeControl(`roller-conductivity-${suffix}`, 'Conductivity (W/m-K)', 0, 10.0, 0.1, 0.01));

    return div;
}

function createImportedObjControls(suffix) {
    const div = document.createElement('div');
    div.id = `shading-controls-imported_obj-${suffix}`;
    div.className = 'hidden space-y-4 pt-4 border-t border-[--grid-color]';

    div.innerHTML = `
        <div>
            <label class="label" for="shading-obj-file-${suffix}">OBJ File (.obj)</label>
            <input type="file" id="shading-obj-file-${suffix}" accept=".obj" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
            <span data-file-display-for="shading-obj-file-${suffix}" class="text-xs text-[--text-secondary] truncate block mt-1">No file selected.</span>
        </div>
        <h4 class="font-semibold text-xs uppercase text-[--text-secondary] pt-2">Transform</h4>
    `;

    const createXYZ = (label, paramPrefix, defVal = 0, step = 0.1) => {
        return `
        <div>
            <label class="label text-xs">${label}</label>
            <div class="grid grid-cols-3 gap-2 mt-1">
                <input type="number" id="${paramPrefix}-x-${suffix}" value="${defVal}" step="${step}" class="param-input-num w-full text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                <input type="number" id="${paramPrefix}-y-${suffix}" value="${defVal}" step="${step}" class="param-input-num w-full text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                <input type="number" id="${paramPrefix}-z-${suffix}" value="${defVal}" step="${step}" class="param-input-num w-full text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
            </div>
        </div>`;
    };

    div.innerHTML += createXYZ('Position (X, Y, Z)', `shading-obj-pos`);
    div.innerHTML += createXYZ('Rotation (°)', `shading-obj-rot`, 0, 1);
    div.innerHTML += createXYZ('Scale', `shading-obj-scale`, 1, 0.05);

    div.innerHTML += `<p class="info-box !text-xs !py-2 !px-3">Click object in 3D view to use gizmo.</p>`;
    return div;
}


/**
 * OUTPUTS MANAGER
 * Manage energyPlusConfig.daylighting.outputs.variables (Output:Variable entries).
 */
function openOutputsManagerPanel() {
    const runPanel = document.getElementById('panel-run');
    if (runPanel) {
        runPanel.classList.remove('hidden');
        runPanel.style.zIndex = getNewZIndex();

        // Trigger click on Outputs item
        const outputsItem = runPanel.querySelector('[data-section="outputs"]');
        if (outputsItem) {
            outputsItem.click();
        }
    } else {
        console.warn('Run Simulation panel not found');
    }
}



/**
 * ENERGYPLUS SIMULATION CONTROL MANAGER
 * Configure global simulation objects:
 *  - Building
 *  - Timestep
 *  - SimulationControl
 *  - GlobalGeometryRules
 *  - ShadowCalculation
 *  - SurfaceConvectionAlgorithm:Inside/Outside
 *  - HeatBalanceAlgorithm
 *  - SizingPeriod:WeatherFileDays
 *  - RunPeriod
 *  - RunPeriodControl:DaylightSavingTime
 * Values stored in energyPlusConfig.simulationControl.
 */


function getNewZIndex() {
    const allWindows = document.querySelectorAll('.floating-window');
    let maxZ = 100;
    allWindows.forEach((win) => {
        const z = parseInt(win.style.zIndex, 10);
        if (z > maxZ) maxZ = z;
    });
    return maxZ + 1;
}

export {
    initializeEnergyPlusSidebar,
    openMaterialsManagerPanel,
    openConstructionsManagerPanel,
    openSchedulesManagerPanel,
    openZoneLoadsManagerPanel,
    openThermostatsPanel,

    openOutputsManagerPanel,

    openShadingManagerPanel,
    openDiagnosticsPanel,
    openRecipePanel,
    recipes
};
