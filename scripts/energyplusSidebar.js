// scripts/energyplusSidebar.js
import { getDom } from './dom.js';
import { project } from './project.js';
import { resultsManager } from './resultsManager.js';
import { validateEnergyPlusRunRequest, formatIssuesSummary } from './energyplusValidation.js';
import { openSchedulesManagerPanel } from './energyplusSchedules.js';
import { openMaterialsManagerPanel, openConstructionsManagerPanel } from './energyplusMaterials.js';
import { openThermostatsPanel } from './energyplusThermostats.js';
/* EnergyPlus contextual help disabled */

let dom;

const recipes = {
    "IDF Preview / Diagnostics": {
        description: "Inspect how the current project and EnergyPlus configuration map into EnergyPlus objects. Highlights missing constructions, materials, schedules, and other issues.",
        id: "energyplus-diagnostics",
        isDiagnostics: true
    },
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
    const checklistPanel = dom['panel-checklist'] || document.getElementById('panel-checklist');
    if (checklistPanel) {
        let content = checklistPanel.querySelector('.window-content');
        if (!content) {
            content = document.createElement('div');
            content.className = 'window-content';
            checklistPanel.appendChild(content);
        }
        content.innerHTML = `
            <div class="window-content-inner">
                <section class="param-section">
                    <div class="panel-subtle" data-role="simulation-checklist-body">
                        <div class="data-value">Evaluating project...</div>
                    </div>
                    <div style="margin-top: 0.35rem; display: flex; justify-content: flex-end;">
                        <button class="btn btn-xxs btn-secondary" data-action="refresh-simulation-checklist">
                            Refresh
                        </button>
                    </div>
                </section>
            </div>
        `;

        const checklistContainer = content.querySelector('[data-role="simulation-checklist-body"]');
        if (checklistContainer) {
            renderSimulationChecklist(checklistContainer);
        }

        const checklistRefreshBtn = content.querySelector('[data-action="refresh-simulation-checklist"]');
        if (checklistRefreshBtn && checklistContainer) {
            checklistRefreshBtn.addEventListener('click', () => {
                renderSimulationChecklist(checklistContainer);
            });
        }

        // Checklist delegated actions
        const checklistBody = content.querySelector('[data-role="simulation-checklist-body"]');
        if (checklistBody) {
            checklistBody.addEventListener('click', async (ev) => {
                const btn = ev.target.closest('[data-checklist-action]');
                if (!btn) return;
                ev.stopPropagation();
                const action = btn.getAttribute('data-checklist-action');

                try {
                    const checklistActions = {
                        'open-diagnostics': openDiagnosticsPanel,
                        'open-materials': openMaterialsManagerPanel,
                        'open-constructions': openConstructionsManagerPanel,
                        'open-schedules': openSchedulesManagerPanel,
                        'open-zone-loads': openZoneLoadsManagerPanel,
                        'open-ideal-loads': openThermostatsPanel,
                        'open-daylighting': openDaylightingManagerPanel,
                        'open-outputs': openOutputsManagerPanel,
                        'open-weather-location': openWeatherLocationManagerPanel,
                        'open-sim-control': openSimulationControlManagerPanel,
                        'open-annual': () => openRecipePanel(recipes['Annual Energy Simulation']),
                        'open-heating-dd': () => openRecipePanel(recipes['Heating Design Day']),
                        'open-cooling-dd': () => openRecipePanel(recipes['Cooling Design Day']),
                    };

                    if (checklistActions[action]) {
                        await Promise.resolve(checklistActions[action]());
                    } else if (action === 'generate-idf') {
                        const { generateAndStoreIdf } = await import('./energyplus.js');
                        await generateAndStoreIdf();
                        alert('IDF generated and stored as model.idf');
                        if (checklistContainer) {
                            renderSimulationChecklist(checklistContainer);
                        }
                    }
                } catch (err) {
                    console.error('Simulation Checklist action failed:', err);
                    alert('Simulation Checklist action failed. Check console for details.');
                }
            });
        }
    }

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
            <div class="window-content-inner">
                <section class="param-section">
                    <div class="recipe-list"></div>
                </section>
                <p class="info-box" style="margin-top: 0.75rem;">
                    <strong>HVAC scope:</strong> Ray-Modeler generates models using
                    <code>ZoneHVAC:IdealLoadsAirSystem</code>. Detailed Air/PlantLoop systems are not generated.
                </p>
            </div>
        `;
        populateRecipeList();
    }


}

/**
 * SIMULATION CHECKLIST
 * Provides a guided 1→7 workflow status derived from current project metadata and diagnostics.
 */

async function computeSimulationChecklist() {
    // Helper to read meta and energyPlusConfig safely
    const safeGetMeta = () => {
        try {
            return (typeof project.getMetadata === 'function' && project.getMetadata()) || project.metadata || {};
        } catch (e) {
            console.warn('SimulationChecklist: failed to read project metadata', e);
            return {};
        }
    };

    const meta = safeGetMeta();
    const ep = meta.energyPlusConfig || meta.energyplus || {};
    const weather = ep.weather || {};
    const simControl = ep.simulationControl || {};

    // Try to pull diagnostics; fall back to null if unavailable.
    let diagnostics = null;
    try {
        const { generateEnergyPlusDiagnostics } = await import('./energyplus.js');
        diagnostics = await generateEnergyPlusDiagnostics();
    } catch (err) {
        console.debug('SimulationChecklist: diagnostics unavailable or failed', err);
    }

    const issues = (diagnostics && diagnostics.issues) || [];

    const hasFatalIssues = issues.some((i) => i.severity === 'error');
    const hasWarnings = issues.some((i) => i.severity === 'warning');

    const geometry = diagnostics && diagnostics.geometry;
    const constructionsDiag = diagnostics && diagnostics.constructions;
    const materialsDiag = diagnostics && diagnostics.materials;
    const schedLoadsDiag = diagnostics && diagnostics.schedulesAndLoads;

    // Quick helpers
    const hasZones =
        (geometry && geometry.totals && geometry.totals.zones > 0) ||
        (typeof project.getZones === 'function' && (project.getZones() || []).length > 0) ||
        (Array.isArray(project.zones) && project.zones.length > 0);

    const missingCons = (constructionsDiag && constructionsDiag.missingConstructions) || [];
    const missingMats = (materialsDiag && materialsDiag.missingMaterials) || [];
    const missingScheds = (schedLoadsDiag && schedLoadsDiag.missingSchedules) || [];
    const inconsistentLoads = (schedLoadsDiag && schedLoadsDiag.inconsistentLoads) || [];

    const epwPath = weather.epwPath || ep.weatherFilePath || null;
    const locationSource = weather.locationSource || 'FromEPW';
    const cl = weather.customLocation || null;

    const validateCustomLocation = () => {
        if (!cl) return false;
        const { name, latitude, longitude, timeZone, elevation } = cl;
        if (!name) return false;
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return false;
        if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return false;
        if (!Number.isFinite(timeZone) || timeZone < -12 || timeZone > 14) return false;
        if (!Number.isFinite(elevation)) return false;
        return true;
    };

    // Step 1: Geometry
    const step1 = (() => {
        if (hasZones) {
            return {
                id: 'geometry',
                label: '1. Geometry',
                status: 'ok',
                description: 'Project zones detected.',
                actions: [{ label: 'Open Diagnostics', actionId: 'open-diagnostics' }],
            };
        }
        return {
            id: 'geometry',
            label: '1. Geometry',
            status: 'warning',
            description: 'No explicit zones found. IDF will fall back to a default Zone_1.',
            actions: [{ label: 'Open Diagnostics', actionId: 'open-diagnostics' }],
        };
    })();

    // Step 2: Constructions & Materials
    const step2 = (() => {
        if (missingCons.length || missingMats.length) {
            return {
                id: 'constructions',
                label: '2. Constructions & Materials',
                status: 'error',
                description: 'Missing constructions or materials referenced by the model.',
                actions: [
                    { label: 'Open Constructions', actionId: 'open-constructions' },
                    { label: 'Open Materials', actionId: 'open-materials' },
                    { label: 'Diagnostics', actionId: 'open-diagnostics' },
                ],
            };
        }
        const hasAny =
            (Array.isArray(ep.constructions) && ep.constructions.length) ||
            (Array.isArray(ep.materials) && ep.materials.length);
        return {
            id: 'constructions',
            label: '2. Constructions & Materials',
            status: hasAny ? 'ok' : 'warning',
            description: hasAny
                ? 'Constructions and materials configured or using built-ins.'
                : 'Using built-in defaults only. Review for project-specific envelopes.',
            actions: [
                { label: 'Open Constructions', actionId: 'open-constructions' },
                { label: 'Open Materials', actionId: 'open-materials' },
            ],
        };
    })();

    // Step 3: Schedules & Zone Loads
    const step3 = (() => {
        if (missingScheds.length || inconsistentLoads.length) {
            return {
                id: 'schedules-loads',
                label: '3. Schedules & Zone Loads',
                status: 'warning',
                description: 'Some schedules or zone loads may be missing or inconsistent.',
                actions: [
                    { label: 'Open Schedules', actionId: 'open-schedules' },
                    { label: 'Open Zone Loads', actionId: 'open-zone-loads' },
                    { label: 'Diagnostics', actionId: 'open-diagnostics' },
                ],
            };
        }
        const hasZoneLoads = Array.isArray(ep.zoneLoads) && ep.zoneLoads.length > 0;
        return {
            id: 'schedules-loads',
            label: '3. Schedules & Zone Loads',
            status: hasZoneLoads ? 'ok' : 'warning',
            description: hasZoneLoads
                ? 'Zone loads and schedules configured.'
                : 'No explicit zone loads defined. Results may under-estimate internal gains.',
            actions: [
                { label: 'Open Schedules', actionId: 'open-schedules' },
                { label: 'Open Zone Loads', actionId: 'open-zone-loads' },
            ],
        };
    })();

    // Step 4: Thermostats & Ideal Loads
    const step4 = (() => {
        const hasThermostats = Array.isArray(ep.thermostats) && ep.thermostats.length > 0;
        const hasIdealLoads =
            (ep.idealLoads && ep.idealLoads.global) ||
            (ep.idealLoads && Array.isArray(ep.idealLoads.perZone) && ep.idealLoads.perZone.length > 0);

        if (hasThermostats && hasIdealLoads) {
            return {
                id: 'thermostats-ideal-loads',
                label: '4. Thermostats & Ideal Loads',
                status: 'ok',
                description: 'Thermostats and IdealLoads configured. HVAC modeled via IdealLoads.',
                actions: [{ label: 'Thermostats & IdealLoads', actionId: 'open-ideal-loads' }],
            };
        }

        return {
            id: 'thermostats-ideal-loads',
            label: '4. Thermostats & Ideal Loads',
            status: 'warning',
            description:
                'No complete thermostat/IdealLoads configuration detected. Zones may free-float or be unconstrained.',
            actions: [{ label: 'Thermostats & IdealLoads', actionId: 'open-ideal-loads' }],
        };
    })();

    // Step 5: Weather & Location
    const step5 = (() => {
        const actions = [{ label: 'Weather & Location', actionId: 'open-weather-location' }];

        if (!epwPath) {
            return {
                id: 'weather-location',
                label: '5. Weather & Location',
                status: 'error',
                description:
                    'No EPW selected. Annual/design-day simulations cannot run reliably without a project EPW.',
                actions,
            };
        }

        if (locationSource === 'Custom' && !validateCustomLocation()) {
            return {
                id: 'weather-location',
                label: '5. Weather & Location',
                status: 'error',
                description: 'Custom location selected but fields are incomplete or invalid.',
                actions,
            };
        }

        return {
            id: 'weather-location',
            label: '5. Weather & Location',
            status: 'ok',
            description:
                locationSource === 'Custom'
                    ? 'EPW set and custom location defined.'
                    : 'EPW set. Location derived from EPW.',
            actions,
        };
    })();

    // Step 6: IDF Generation readiness
    const step6 = (() => {
        if (hasFatalIssues || missingCons.length || missingMats.length) {
            return {
                id: 'idf-generation',
                label: '6. IDF Generation',
                status: 'error',
                description:
                    'Diagnostics report blocking issues (e.g., missing constructions/materials). Fix before generating IDF.',
                actions: [
                    { label: 'Diagnostics', actionId: 'open-diagnostics' },
                    { label: 'Generate IDF', actionId: 'generate-idf' },
                ],
            };
        }

        if (hasWarnings || missingScheds.length || inconsistentLoads.length) {
            return {
                id: 'idf-generation',
                label: '6. IDF Generation',
                status: 'warning',
                description:
                    'IDF can be generated, but diagnostics report warnings (e.g., schedules/loads). Review before final runs.',
                actions: [
                    { label: 'Diagnostics', actionId: 'open-diagnostics' },
                    { label: 'Generate IDF', actionId: 'generate-idf' },
                ],
            };
        }

        return {
            id: 'idf-generation',
            label: '6. IDF Generation',
            status: 'ok',
            description: 'Configuration is consistent. Generate IDF from the current project.',
            actions: [{ label: 'Generate IDF', actionId: 'generate-idf' }],
        };
    })();

    // Step 7: Run EnergyPlus readiness
    const step7 = (() => {
        const actions = [
            { label: 'Annual', actionId: 'open-annual' },
            { label: 'Heating DD', actionId: 'open-heating-dd' },
            { label: 'Cooling DD', actionId: 'open-cooling-dd' },
        ];

        if (!epwPath) {
            return {
                id: 'run-energyplus',
                label: '7. Run EnergyPlus',
                status: 'error',
                description: 'Cannot run: EPW is missing. Configure in Weather & Location.',
                actions: [{ label: 'Weather & Location', actionId: 'open-weather-location' }],
            };
        }

        if (hasFatalIssues || missingCons.length || missingMats.length) {
            return {
                id: 'run-energyplus',
                label: '7. Run EnergyPlus',
                status: 'error',
                description: 'Cannot run safely: diagnostics report blocking IDF issues.',
                actions: [
                    { label: 'Diagnostics', actionId: 'open-diagnostics' },
                    { label: 'Constructions', actionId: 'open-constructions' },
                    { label: 'Materials', actionId: 'open-materials' },
                ],
            };
        }

        const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

        if (!isElectron) {
            return {
                id: 'run-energyplus',
                label: '7. Run EnergyPlus',
                status: 'warning',
                description:
                    'Electron bridge not detected. You can generate IDF/scripts but cannot run EnergyPlus directly here.',
                actions: [
                    { label: 'Annual', actionId: 'open-annual' },
                    { label: 'Heating DD', actionId: 'open-heating-dd' },
                    { label: 'Cooling DD', actionId: 'open-cooling-dd' },
                ],
            };
        }

        return {
            id: 'run-energyplus',
            label: '7. Run EnergyPlus',
            status: hasWarnings ? 'warning' : 'ok',
            description: hasWarnings
                ? 'Ready to run via Electron; diagnostics report warnings to review.'
                : 'Ready to run EnergyPlus via Electron recipes.',
            actions,
        };
    })();

    return [step1, step2, step3, step4, step5, step6, step7];
}

function renderSimulationChecklist(container) {
    container.innerHTML = `
        <div class="text-sm text-[--text-secondary]">
            Evaluating project configuration...
        </div>
    `;

    computeSimulationChecklist()
        .then((items) => {
            if (!items || !items.length) {
                container.innerHTML = `
                    <div class="text-sm text-red-400">
                        Failed to evaluate checklist.
                    </div>
                `;
                return;
            }

            const icon = (status) => {
                const base = 'status-dot';
                if (status === 'ok') return `<span class="${base}" style="background-color: var(--status-ok); margin-right: 6px;"></span>`;
                if (status === 'warning') return `<span class="${base}" style="background-color: var(--status-warn); margin-right: 6px;"></span>`;
                return `<span class="${base}" style="background-color: var(--status-error); margin-right: 6px;"></span>`;
            };

            const html = items
                .map((item) => {
                    const actions =
                        item.actions && item.actions.length
                            ? item.actions
                                .map(
                                    (a) =>
                                        `<button class="btn btn-xxs btn-secondary ml-1" data-checklist-action="${a.actionId}">${a.label}</button>`
                                )
                                .join('')
                            : '';
                    return `
                        <div style="padding: 0.25rem 0; border-bottom: 1px solid var(--grid-color);">
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.25rem;">
                                <div style="display:flex; align-items:center; min-width:0;">
                                    ${icon(item.status)}
                                    <span class="data-value" style="font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                        ${item.label}
                                    </span>
                                </div>
                                <div style="display:flex; align-items:center; gap:0.25rem;">
                                    ${actions}
                                </div>
                            </div>
                            <div style="margin-left:18px; margin-top:2px; font-size:0.8rem; color:var(--text-secondary);">
                                ${item.description || ''}
                            </div>
                        </div>
                    `;
                })
                .join('');

            container.innerHTML = html;
        })
        .catch((err) => {
            console.error('SimulationChecklist: render failed', err);
            container.innerHTML = `
                <div class="text-sm text-red-400">
                    Failed to evaluate checklist. Check console for details.
                </div>
            `;
        });
}

function populateRecipeList() {
    const recipeList = dom['panel-run']?.querySelector('.recipe-list');
    if (!recipeList) return;

    recipeList.innerHTML = '';
    for (const name in recipes) {
        const recipe = recipes[name];
        const button = document.createElement('button');
        button.className = 'btn btn-sm btn-secondary';
        button.style.width = '100%';
        button.style.justifyContent = 'flex-start';
        button.style.flexDirection = 'column';
        button.style.alignItems = 'flex-start';
        button.style.gap = '2px';
        button.style.padding = '0.4rem 0.6rem';
        button.innerHTML = `
            <div class="data-value" style="font-size:0.9rem; font-weight:600;">${name}</div>
            <div style="font-size:0.8rem; font-weight:400; color:var(--text-secondary); white-space:normal;">
                ${recipe.description}
            </div>
        `;
        button.onclick = () => {
            if (recipe.isDiagnostics) {
                openDiagnosticsPanel();
            } else {
                openRecipePanel(recipe);
            }
        };
        recipeList.appendChild(button);
    }
}

function openRecipePanel(recipe) {
    const panelId = `panel-${recipe.id}`;
    let panel = document.getElementById(panelId);
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
    if (!panel) {
        panel = createDiagnosticsPanel();
        document.getElementById('window-container').appendChild(panel);
    }
    panel.classList.remove('hidden');
    panel.style.zIndex = getNewZIndex();
    await refreshDiagnosticsPanel(panel);
}

function createDiagnosticsPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-energyplus-diagnostics';
    panel.className = 'floating-window ui-panel resizable-panel';

    panel.innerHTML = `
        <div class="window-header">
            <span>EnergyPlus IDF Preview / Diagnostics</span>
            <div class="window-controls">
                <div class="window-icon-max" title="Maximize/Restore"></div>
                <div class="collapse-icon" title="Minimize"></div>
                <div class="window-icon-close" title="Close"></div>
            </div>
        </div>
        <div class="window-content">
            <div class="resize-handle-edge top"></div>
            <div class="resize-handle-edge right"></div>
            <div class="resize-handle-edge bottom"></div>
            <div class="resize-handle-edge left"></div>
            <div class="resize-handle-corner top-left"></div>
            <div class="resize-handle-corner top-right"></div>
            <div class="resize-handle-corner bottom-left"></div>
            <div class="resize-handle-corner bottom-right"></div>

            <p class="info-box">
                Preview how the current Ray-Modeler project and EnergyPlus configuration map into EnergyPlus objects.
                This diagnostics view does not modify your project or write files.
            </p>

            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
                <span class="label" style="margin-bottom:0;">Summary</span>
                <button class="btn btn-xxs btn-secondary" data-action="refresh-diagnostics">
                    Refresh
                </button>
            </div>

            <div class="panel-subtle scrollable-panel-inner" style="max-height:18rem;" data-role="diagnostics-body">
                <div style="font-size:0.8rem; color:var(--text-secondary);">
                    Diagnostics will appear here.
                </div>
            </div>

            <div style="font-size:0.8rem; color:var(--text-secondary);">
                Use this panel to:
                <ul class="list-disc pl-4 space-y-0.5">
                    <li>Verify that zones are detected.</li>
                    <li>Check constructions and materials are defined and referenced correctly.</li>
                    <li>Check schedules and loads for missing references.</li>
                    <li>Jump directly to configuration panels to fix detected issues.</li>
                </ul>
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

    const issueBadge = hasErrors
        ? `<span class="ml-1 px-1 rounded bg-red-600/70 text-xs">Errors</span>`
        : hasWarnings
            ? `<span class="ml-1 px-1 rounded bg-yellow-600/70 text-xs">Warnings</span>`
            : `<span class="ml-1 px-1 rounded bg-emerald-700/70 text-xs">Clean</span>`;

    const zonesHtml = (geometry?.zones || [])
        .map(
            (z) => `
            <tr>
                <td class="px-1 py-0.5 align-top">${z.name}</td>
                <td class="px-1 py-0.5 align-top text-[--text-secondary]">
                    ${z.surfaces?.total ?? 0}
                </td>
                <td class="px-1 py-0.5 align-top text-[--text-secondary]">
                    ${z.windows?.total ?? 0}
                </td>
            </tr>
        `
        )
        .join('') ||
        `<tr><td class="px-1 py-0.5 text-white" colspan="3">
            No zones detected. Generated IDF will fall back to a single Zone_1.
        </td></tr>`;

    const missingCons = constructions?.missingConstructions || [];
    const unusedCons = constructions?.unusedConstructions || [];
    const missingMats = materials?.missingMaterials || [];
    const unusedMats = materials?.unusedMaterials || [];
    const missingScheds = schedulesAndLoads?.missingSchedules || [];
    const inconsistentLoads = schedulesAndLoads?.inconsistentLoads || [];

    // Group issues by coarse domain for deep-linking
    const grouped = {
        geometry: [],
        constructions: [],
        schedules: [],
        thermostats: [],
        weather: [],
        daylighting: [],
        outdoorAir: [],
        shading: [],
        other: [],
    };

    (issues || []).forEach((i) => {
        const msg = (i.message || '').toLowerCase();
        const sev = i.severity || 'info';
        const entry = { ...i, severity: sev };

        if (
            msg.includes('construction') ||
            msg.includes('material')
        ) {
            grouped.constructions.push(entry);
        } else if (
            msg.includes('schedule') ||
            msg.includes('zone load') ||
            msg.includes('people:') ||
            msg.includes('lighting:') ||
            msg.includes('equipment:')
        ) {
            grouped.schedules.push(entry);
        } else if (
            msg.includes('thermostat') ||
            msg.includes('idealloads') ||
            msg.includes('ideal loads')
        ) {
            grouped.thermostats.push(entry);
        } else if (
            msg.includes('weather') ||
            msg.includes('epw') ||
            msg.includes('runperiod') ||
            msg.includes('simulationcontrol')
        ) {
            grouped.weather.push(entry);
        } else if (
            msg.includes('daylighting') ||
            msg.includes('illuminance map') ||
            (msg.includes('output:variable') && msg.includes('lighting')) ||
            i.context?.domain === 'daylighting'
        ) {
            grouped.daylighting.push(entry);
        } else if (
            msg.includes('outdoor air') ||
            msg.includes('designspecification:outdoorair') ||
            msg.includes('natural ventilation') ||
            msg.includes('zoneventilation:')
        ) {
            grouped.outdoorAir.push(entry);
        } else if (
            msg.includes('shading') ||
            msg.includes('overhang') ||
            msg.includes('windowproperty:shadingcontrol') ||
            i.context?.domain === 'shading'
        ) {
            grouped.shading.push(entry);
        } else if (
            msg.includes('zone') ||
            msg.includes('surface') ||
            msg.includes('geometry')
        ) {
            grouped.geometry.push(entry);
        } else {
            grouped.other.push(entry);
        }
    });

    const renderIssueList = (arr, navDomain) => {
        if (!arr.length) {
            return `<div class="text-xs text-[--text-secondary]">No issues.</div>`;
        }
        return arr
            .map((i) => {
                const color =
                    i.severity === 'error'
                        ? 'text-red-400'
                        : i.severity === 'warning'
                            ? 'text-yellow-300'
                            : 'text-[--text-secondary]';

                const ctx = i.context || {};
                const attrs = [];

                if (navDomain === 'daylighting' || ctx.domain === 'daylighting') {
                    attrs.push(`data-nav="daylighting"`);
                    if (ctx.zoneName) {
                        attrs.push(`data-target-zone="${String(ctx.zoneName)}"`);
                    }
                    if (ctx.mapName) {
                        attrs.push(`data-target-map="${String(ctx.mapName)}"`);
                    }
                } else if (navDomain === 'shading' || ctx.domain === 'shading') {
                    attrs.push(`data-nav="shading"`);
                    if (ctx.surfaceName) {
                        attrs.push(`data-target-surface="${String(ctx.surfaceName)}"`);
                    }
                    if (ctx.controlName) {
                        attrs.push(`data-target-control="${String(ctx.controlName)}"`);
                    }
                }

                const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
                return `<div class="${color} cursor-pointer" ${attrStr}>• [${i.severity}] ${i.message}</div>`;
            })
            .join('');
    };

    const button = (label, action) =>
        `<button class="btn btn-xxs btn-secondary ml-1" data-nav="${action}">${label}</button>`;

    container.innerHTML = `
        <div class="space-y-2">
            <div class="flex items-center justify-between">
                <div>
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">
                        Overall Status
                    </span>
                    ${issueBadge}
                </div>
            </div>

            <div class="border border-gray-700/70 rounded bg-black/40 p-2 space-y-1">
                <div class="font-semibold text-xs uppercase text-[--text-secondary]">
                    Geometry
                </div>
                <div class="text-xs text-[--text-secondary] mb-1">
                    Zones detected: ${geometry?.totals?.zones ?? 0}
                </div>
                <table class="w-full text-xs">
                    <thead class="bg-black/40">
                        <tr>
                            <th class="px-1 py-0.5 text-left">Zone</th>
                            <th class="px-1 py-0.5 text-left">Surfaces*</th>
                            <th class="px-1 py-0.5 text-left">Windows*</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${zonesHtml}
                    </tbody>
                </table>
                <div class="text-xs text-[--text-secondary] mt-0.5">
                    *Surface/window counts are placeholders until explicit geometry mapping is exposed.
                </div>
            </div>

            <div class="border border-gray-700/70 rounded bg-black/40 p-2 space-y-1">
                <div class="flex items-center justify-between">
                    <div class="font-semibold text-xs uppercase text-[--text-secondary]">
                        Constructions & Materials
                    </div>
                    <div class="flex items-center">
                        ${(missingCons.length || missingMats.length)
            ? button('Open Constructions', 'constructions') +
            button('Open Materials', 'materials')
            : ''}
                    </div>
                </div>
                <div class="text-xs">
                    ${missingCons.length
            ? `<div class="text-red-400">Missing constructions: ${missingCons
                .map((n) => `<code>${n}</code>`)
                .join(', ')}</div>`
            : `<div class="text-[--text-secondary]">No missing constructions.</div>`}
                    ${unusedCons.length
            ? `<div class="text-[--text-secondary]">Unused constructions: ${unusedCons
                .slice(0, 10)
                .map((n) => `<code>${n}</code>`)
                .join(', ')}${unusedCons.length > 10 ? '…' : ''}</div>`
            : ''}
                    ${missingMats.length
            ? `<div class="text-red-400">Missing materials (referenced but not defined): ${missingMats
                .map((n) => `<code>${n}</code>`)
                .join(', ')}</div>`
            : `<div class="text-[--text-secondary]">No missing materials referenced by constructions.</div>`}
                    ${unusedMats.length
            ? `<div class="text-[--text-secondary]">Unused materials: ${unusedMats
                .slice(0, 10)
                .map((n) => `<code>${n}</code>`)
                .join(', ')}${unusedMats.length > 10 ? '…' : ''}</div>`
            : ''}
                </div>
            </div>

            <div class="border border-gray-700/70 rounded bg-black/40 p-2 space-y-1">
                <div class="flex items-center justify-between">
                    <div class="font-semibold text-xs uppercase text-[--text-secondary]">
                        Schedules & Loads
                    </div>
                    <div class="flex items-center">
                        ${missingScheds.length || inconsistentLoads.length
            ? button('Open Schedules', 'schedules') +
            button('Open Zone Loads', 'zone-loads')
            : ''}
                    </div>
                </div>
                <div class="text-xs">
                    ${missingScheds.length
            ? `<div class="text-yellow-300">Missing schedules: ${missingScheds
                .map((n) => `<code>${n}</code>`)
                .join(', ')}</div>`
            : `<div class="text-[--text-secondary]">No missing schedules referenced by loads/controls.</div>`}
                    ${inconsistentLoads.length
            ? `<div class="mt-1 text-xs text-yellow-300">
                               ${inconsistentLoads
                .slice(0, 20)
                .map(
                    (e) =>
                        `• [${e.zone}] ${e.issue}`
                )
                .join('<br>')}
                               ${inconsistentLoads.length > 20
                ? '<br>…'
                : ''
            }
                           </div>`
            : ''}
                </div>
            </div>

            <!-- Grouped Issues with deep-links -->
            <div class="border border-gray-700/70 rounded bg-black/40 p-2 space-y-1">
                <div class="font-semibold text-xs uppercase text-[--text-secondary]">
                    Issues by Category
                </div>

                <!-- Geometry -->
                <div class="mt-1">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold text-[--text-secondary]">Geometry</span>
                        <button class="btn btn-xxs btn-secondary ml-1" data-nav="geometry">Open Diagnostics</button>
                    </div>
                    <div class="text-xs">
                        ${renderIssueList(grouped.geometry)}
                    </div>
                </div>

                <!-- Constructions & Materials -->
                <div class="mt-1">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold text-[--text-secondary]">Constructions & Materials</span>
                        <div>
                            <button class="btn btn-xxs btn-secondary ml-1" data-nav="constructions">Constructions</button>
                            <button class="btn btn-xxs btn-secondary ml-1" data-nav="materials">Materials</button>
                        </div>
                    </div>
                    <div class="text-xs">
                        ${renderIssueList(grouped.constructions)}
                    </div>
                </div>

                <!-- Schedules & Zone Loads -->
                <div class="mt-1">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold text-[--text-secondary]">Schedules & Zone Loads</span>
                        <div>
                            <button class="btn btn-xxs btn-secondary ml-1" data-nav="schedules">Schedules</button>
                            <button class="btn btn-xxs btn-secondary ml-1" data-nav="zone-loads">Zone Loads</button>
                        </div>
                    </div>
                    <div class="text-xs">
                        ${renderIssueList(grouped.schedules)}
                    </div>
                </div>

                <!-- Thermostats & IdealLoads -->
                <div class="mt-1">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold text-[--text-secondary]">Thermostats & IdealLoads</span>
                        <button class="btn btn-xxs btn-secondary ml-1" data-nav="ideal-loads">
                            <svg width="16" height="16" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="iconify iconify--emojione-monotone" style="fill: currentColor;"><path d="M30.381 14.757c-11.967 0-21.668 9.681-21.668 21.621C8.713 48.32 18.414 58 30.381 58s21.666-9.68 21.666-21.622c0-11.94-9.699-21.621-21.666-21.621m1.286 18.828a1.285 1.285 0 0 1-2.572 0v-14.3a1.287 1.287 0 0 1 2.572 0z"/><path d="M59.912 25.526a30.9 30.9 0 0 0-10.499-13.738A29.8 29.8 0 0 0 33.02 6.027a29.6 29.6 0 0 0-16.88 4.461c-5.012 3.129-9.07 7.78-11.504 13.226-2.434 5.396-3.205 11.557-2.216 17.44.661 4.018 2.194 7.893 4.418 11.331h2.968c-2.12-3.169-3.578-6.778-4.218-10.503-.86-4.94-.328-10.129 1.512-14.709a26.3 26.3 0 0 1 9.055-11.597c4.039-2.913 8.917-4.558 13.816-4.692a24.46 24.46 0 0 1 13.958 3.876c4.145 2.662 7.416 6.594 9.311 11.018 1.957 4.518 2.466 9.543 1.594 14.291a24.07 24.07 0 0 1-6.32 12.315h9.299a31.3 31.3 0 0 0 3.646-9.815c1.067-5.696.558-11.694-1.547-17.143"/></svg>
                        </button>
                    </div>
                    <div class="text-xs">
                        ${renderIssueList(grouped.thermostats)}
                    </div>
                </div>

                <!-- Weather & Simulation Control -->
                <div class="mt-1">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold text-[--text-secondary]">Weather & Simulation Control</span>
                        <div>
                            <button class="btn btn-xxs btn-secondary ml-1" data-nav="weather">Weather & Location</button>
                            <button class="btn btn-xxs btn-secondary ml-1" data-nav="sim-control">Sim Control</button>
                        </div>
                    </div>
                    <div class="text-xs">
                        ${renderIssueList(grouped.weather)}
                    </div>
                </div>

                <!-- Daylighting & Outputs -->
                <div class="mt-1">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold text-[--text-secondary]">Daylighting & Outputs</span>
                        <button class="btn btn-xxs btn-secondary ml-1" data-nav="daylighting">Daylighting Panel</button>
                    </div>
                    <div class="text-xs">
                        ${renderIssueList(grouped.daylighting, 'daylighting')}
                    </div>
                </div>

                <!-- Outdoor Air & Natural Ventilation -->
                <div class="mt-1">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold text-[--text-secondary]">Outdoor Air & Natural Ventilation</span>
                        <button class="btn btn-xxs btn-secondary ml-1" data-nav="outdoor-air">Outdoor Air Panel</button>
                    </div>
                    <div class="text-xs">
                        ${renderIssueList(grouped.outdoorAir)}
                    </div>
                </div>

                <!-- Shading & Solar Control -->
                <div class="mt-1">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold text-[--text-secondary]">Shading & Solar Control</span>
                        <button class="btn btn-xxs btn-secondary ml-1" data-nav="shading">Shading Panel</button>
                    </div>
                    <div class="text-xs">
                        ${renderIssueList(grouped.shading, 'shading')}
                    </div>
                </div>

                <!-- Other -->
                <div class="mt-1">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold text-[--text-secondary]">Other / Unclassified</span>
                    </div>
                    <div class="text-xs">
                        ${renderIssueList(grouped.other)}
                    </div>
                </div>
            </div>
        </div>
    `;

    // Wire quick navigation buttons
    container
        .querySelectorAll('[data-nav]')
        .forEach((el) => {
            el.addEventListener('click', (ev) => {
                const target = ev.currentTarget;
                const nav = target.getAttribute('data-nav');
                const targetZone = target.getAttribute('data-target-zone');
                const targetMap = target.getAttribute('data-target-map');

                if (nav === 'materials') {
                    openMaterialsManagerPanel();
                } else if (nav === 'constructions') {
                    openConstructionsManagerPanel();
                } else if (nav === 'schedules') {
                    openSchedulesManagerPanel();
                } else if (nav === 'zone-loads') {
                    openZoneLoadsManagerPanel();
                } else if (nav === 'ideal-loads') {
                    openThermostatsPanel();
                } else if (nav === 'weather') {
                    openWeatherLocationManagerPanel();
                } else if (nav === 'sim-control') {
                    openSimulationControlManagerPanel();
                } else if (nav === 'daylighting') {
                    openDaylightingManagerPanel();

                    // If diagnostics provided a target zone/map, scroll/highlight in the Daylighting panel.
                    const dp = document.getElementById('panel-energyplus-daylighting');
                    if (dp) {
                        // Target zone row in Daylighting controls
                        if (targetZone) {
                            const row =
                                dp.querySelector(`.daylighting-controls-tbody tr[data-zone-name="${CSS.escape(targetZone)}"]`) ||
                                Array.from(dp.querySelectorAll('.daylighting-controls-tbody tr')).find((tr) =>
                                    tr.textContent.includes(targetZone)
                                );
                            if (row) {
                                row.classList.add('diag-highlight');
                                row.scrollIntoView({ block: 'center', behavior: 'smooth' });
                                setTimeout(() => row.classList.remove('diag-highlight'), 2000);
                            }
                        }

                        // Target illuminance map row
                        if (targetMap) {
                            const rows = dp.querySelectorAll('.illum-maps-tbody tr');
                            const mapRow = Array.from(rows).find((tr) => {
                                const nameInput = tr.querySelector('[data-field="name"]');
                                return nameInput && nameInput.value === targetMap;
                            });
                            if (mapRow) {
                                mapRow.classList.add('diag-highlight');
                                mapRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
                                setTimeout(() => mapRow.classList.remove('diag-highlight'), 2000);
                            }
                        }
                    }
                } else if (nav === 'outdoor-air') {
                    openOutdoorAirManagerPanel();
                } else if (nav === 'shading') {
                    openShadingManagerPanel();
                } else if (nav === 'geometry') {
                    // Geometry is best inspected via diagnostics panel itself
                    openDiagnosticsPanel();
                }
            });
        });
}

function createRecipePanel(recipe) {
    const panel = document.createElement('div');
    panel.id = `panel-${recipe.id}`;
    panel.className = 'floating-window ui-panel resizable-panel';
    panel.dataset.scriptName = recipe.scriptName;

    let paramsHtml = '';
    recipe.params.forEach((param) => {
        paramsHtml += `
            <div>
                <label class="label" for="${param.id}">${param.name}</label>
                <input type="${param.type}" id="${param.id}" ${param.accept ? `accept="${param.accept}"` : ''} class="w-full text-sm">
            </div>
        `;
    });

    const isAnnual = recipe.id === 'annual-energy-simulation';
    const isHeating = recipe.id === 'heating-design-day';
    const isCooling = recipe.id === 'cooling-design-day';

    // Helper: read current project-level EPW from metadata
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
        <div class="window-content space-y-4">
            <div class="resize-handle-edge top"></div>
            <div class="resize-handle-edge right"></div>
            <div class="resize-handle-edge bottom"></div>
            <div class="resize-handle-edge left"></div>
            <div class="resize-handle-corner top-left"></div>
            <div class="resize-handle-corner top-right"></div>
            <div class="resize-handle-corner bottom-left"></div>
            <div class="resize-handle-corner bottom-right"></div>
            <p class="info-box !text-xs !py-2 !px-3">${recipe.description}</p>
            ${isAnnual
            ? `
            <button class="btn btn-secondary w-full" data-action="generate-idf-from-project">
                Generate IDF from current Ray-Modeler project
            </button>
            <p class="text-xs text-[--text-secondary] mt-1">
                Uses the current <code>energyPlusConfig</code> to write <code>model.idf</code>.
                Configure Materials, Constructions, Schedules, Zone Loads, Thermostats & IdealLoads, Daylighting, Outputs, and Simulation Control in the sidebar.
            </p>
            `
            : ''
        }
            ${paramsHtml}
            ${isAnnual
            ? `
            <div class="text-xs text-[--text-secondary]">
                Project EPW: <span data-role="project-epw-label">(resolving...)</span>
            </div>
            `
            : ''
        }
            ${isHeating || isCooling
            ? `
            <p class="text-xs text-[--text-secondary]">
                This recipe reuses the selected IDF (or <code>model.idf</code> by default).
                Ensure your <code>SimulationControl</code> and <code>SizingPeriod</code> objects in the IDF represent the desired design-day conditions.
                EnergyPlus is run in a dedicated <code>runs/${isHeating ? 'heating-design' : 'cooling-design'}</code> directory via the Electron bridge.
            </p>
            `
            : ''
        }
            <div class="space-y-2">
                <button class="btn btn-primary w-full" data-action="run">Run Simulation</button>
            </div>
            <div class="mt-3">
                <div class="text-xs text-[--text-secondary] mb-0.5">
                    Runs are executed via Electron with:
                    <code>model.idf</code> or your selected IDF and outputs written under
                    <code>runs/<recipe-name>/</code> relative to the project directory.
                </div>
                <h5 class="font-semibold text-xs uppercase text-[--text-secondary] mb-1">EnergyPlus Output</h5>
                <pre class="simulation-output-console w-full h-32 font-mono text-xs p-2 rounded bg-[--grid-color] border border-gray-500/50 overflow-y-auto whitespace-pre-wrap"></pre>
            </div>
        </div>
    `;

    // Initialize standard floating window behavior (drag, resize, close/max/min)
    if (typeof window !== 'undefined' && window.initializePanelControls) {
        window.initializePanelControls(panel);
    } else {
        const closeButton = panel.querySelector('.window-icon-close');
        if (closeButton) {
            closeButton.onclick = () => panel.classList.add('hidden');
        }
    }

    // Wire actions
    const generateBtn = panel.querySelector('[data-action="generate-idf-from-project"]');
    const runBtn = panel.querySelector('[data-action="run"]');
    const outputConsole = panel.querySelector('.simulation-output-console');
    const projectEpwLabel = panel.querySelector('[data-role="project-epw-label"]');

    if (isAnnual && projectEpwLabel) {
        const epw = getProjectEpwPath();
        projectEpwLabel.textContent = epw || '(not set)';
    }

    // Lazy import to avoid circular deps on load
    if (generateBtn) {
        generateBtn.addEventListener('click', async () => {
            try {
                const { generateAndStoreIdf } = await import('./energyplus.js');
                const idfContent = await generateAndStoreIdf();
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


    if (runBtn) {
        // Per-panel listeners to avoid leaks; scoped to this recipe panel.
        let epOutputListener = null;
        let epExitListener = null;

        runBtn.addEventListener('click', () => {
            if (!window.electronAPI) {
                if (outputConsole) {
                    outputConsole.textContent +=
                        'Electron environment not detected. Please run via Electron or use the generated IDF/scripts.\n';
                }
                alert(
                    'EnergyPlus can only be run directly inside the Electron app. In browser, use the generated IDF/scripts manually.'
                );
                return;
            }

            const idfInput = panel.querySelector('#idf-file');
            const epwInput = panel.querySelector('#epw-file');
            const exeInput = panel.querySelector('#eplus-exe');

            const idfPath =
                idfInput &&
                    idfInput.files &&
                    idfInput.files[0]
                    ? idfInput.files[0].path || idfInput.files[0].name
                    : 'model.idf'; // fallback: use generated IDF in project folder

            // EPW resolution for all recipes:
            // 1) Explicit EPW selected in this panel (if present)
            // 2) Project-level EPW from energyPlusConfig.weather.epwPath / weatherFilePath
            const explicitEpw =
                epwInput &&
                    epwInput.files &&
                    epwInput.files[0]
                    ? epwInput.files[0].path || epwInput.files[0].name
                    : null;

            const projectEpw = getProjectEpwPath();
            const epwPath = explicitEpw || projectEpw || null;

            const energyPlusPath =
                exeInput && exeInput.value
                    ? exeInput.value.trim()
                    : null;

            // For annual and design-day recipes, we require EPW to keep behavior explicit.
            if (!epwPath) {
                alert(
                    'No EPW specified. Select an EPW here or configure a project-level EPW in the "Weather & Location" panel.'
                );
                return;
            }

            if (!energyPlusPath) {
                alert('Specify the EnergyPlus executable path.');
                return;
            }

            const runName = getRunName();
            const runId = `${runName}-${Date.now()}`;

            // Pre-run validation (no Electron call if blocking issues exist)
            const preRun = validateEnergyPlusRunRequest({
                idfPath,
                epwPath,
                energyPlusPath,
                recipeId: recipe.id,
            });

            if (!preRun.ok) {
                const summary = formatIssuesSummary(preRun.issues, 4);
                if (outputConsole) {
                    outputConsole.textContent +=
                        'Pre-run validation failed:\n' +
                        (summary ||
                            'Blocking configuration issues detected.') +
                        '\n\n';
                    outputConsole.scrollTop =
                        outputConsole.scrollHeight;
                }
                alert(
                    'Cannot start EnergyPlus run due to configuration issues.\n\n' +
                    (summary ||
                        'Check the EnergyPlus sidebar configuration and diagnostics.')
                );
                return;
            }

            // Register run in resultsManager (status: pending)
            resultsManager.registerEnergyPlusRun(runId, {
                label: `EnergyPlus ${runName}`,
                recipeId: recipe.id,
            });

            if (outputConsole) {
                outputConsole.textContent =
                    `Running EnergyPlus [${runName}]...\n` +
                    `IDF: ${idfPath}\n` +
                    `EPW: ${epwPath}\n` +
                    `Exe: ${energyPlusPath}\n` +
                    `Outputs: runs/${runName}/ (if supported by Electron bridge)\n\n`;
            }

            // Clean up any previous listeners for this panel to avoid leaks.
            if (
                window.electronAPI.offEnergyPlusOutput &&
                epOutputListener
            ) {
                window.electronAPI.offEnergyPlusOutput(
                    epOutputListener
                );
                epOutputListener = null;
            }
            if (
                window.electronAPI.offEnergyPlusExit &&
                epExitListener
            ) {
                window.electronAPI.offEnergyPlusExit(epExitListener);
                epExitListener = null;
            }

            // Run EnergyPlus via Electron bridge.
            // See preload.js for full contract; main should:
            // - Use runName/runId to choose output directory, e.g. runs/annual, runs/heating-design.
            // - Invoke: energyplus -w epwPath -d runs/runName -r idfPath
            // - Stream stdout/stderr to 'energyplus-output'; send 'energyplus-exit' on completion.
            const runOptions = {
                idfPath,
                epwPath,
                energyPlusPath,
                runName,
                runId, // Used by ResultsManager and for filtering logs
            };

            window.electronAPI.runEnergyPlus(runOptions);

            // Output handler, tolerant to both structured and legacy payloads.
            const handleOutput = (payload) => {
                if (!outputConsole) return;

                let text = '';
                if (
                    payload &&
                    typeof payload === 'object' &&
                    typeof payload.chunk === 'string'
                ) {
                    // New structured form: filter by runId if provided.
                    if (
                        payload.runId &&
                        payload.runId !== runId
                    ) {
                        return;
                    }
                    text = payload.chunk;
                } else {
                    // Legacy: plain string.
                    text = String(payload ?? '');
                }

                if (!text) return;
                outputConsole.textContent += text;
                outputConsole.scrollTop =
                    outputConsole.scrollHeight;
            };

            // Exit handler, tolerant to both structured and legacy payloads.
            const handleExit = (payload) => {
                // Ignore events for other runs if runId is present.
                if (
                    payload &&
                    typeof payload === 'object' &&
                    payload.runId &&
                    payload.runId !== runId
                ) {
                    return;
                }

                const code =
                    typeof payload === 'object' &&
                        payload !== null
                        ? typeof payload.exitCode === 'number'
                            ? payload.exitCode
                            : 0
                        : typeof payload === 'number'
                            ? payload
                            : 0;

                const resolvedRunId =
                    (payload &&
                        typeof payload === 'object' &&
                        payload.runId) ||
                    runId;

                const baseDir =
                    payload &&
                        typeof payload === 'object'
                        ? payload.outputDir
                        : undefined;

                const errContent =
                    payload &&
                        typeof payload === 'object'
                        ? payload.errContent
                        : undefined;

                const csvContents =
                    payload &&
                        typeof payload === 'object'
                        ? payload.csvContents
                        : undefined;

                const runRecord =
                    resultsManager.parseEnergyPlusResults(
                        resolvedRunId,
                        {
                            baseDir,
                            errContent,
                            csvContents,
                            statusFromRunner: code,
                        }
                    );

                if (outputConsole) {
                    outputConsole.textContent +=
                        `\n--- EnergyPlus exited with code: ${code} ---\n`;

                    if (runRecord && runRecord.errors) {
                        const {
                            fatal,
                            severe,
                            warning,
                        } = runRecord.errors;
                        const lines = [];
                        if (fatal.length) {
                            lines.push(
                                `Fatal errors: ${fatal.length}`
                            );
                            lines.push(fatal[0]);
                        }
                        if (severe.length) {
                            lines.push(
                                `Severe errors: ${severe.length}`
                            );
                            if (!fatal.length) {
                                lines.push(severe[0]);
                            }
                        }
                        if (warning.length) {
                            lines.push(
                                `Warnings: ${warning.length}`
                            );
                        }
                        if (lines.length) {
                            outputConsole.textContent +=
                                lines.join('\n') + '\n';
                        }
                    }

                    outputConsole.scrollTop =
                        outputConsole.scrollHeight;
                }

                // Auto-detach listeners on completion when off* is available.
                if (
                    window.electronAPI.offEnergyPlusOutput &&
                    epOutputListener
                ) {
                    window.electronAPI.offEnergyPlusOutput(
                        epOutputListener
                    );
                    epOutputListener = null;
                }
                if (
                    window.electronAPI.offEnergyPlusExit &&
                    epExitListener
                ) {
                    window.electronAPI.offEnergyPlusExit(
                        epExitListener
                    );
                    epExitListener = null;
                }
            };

            // Attach listeners (prefer structured helpers; fallback to legacy).
            if (window.electronAPI.onEnergyPlusOutput) {
                epOutputListener =
                    window.electronAPI.onEnergyPlusOutput(
                        handleOutput
                    );
            }

            if (window.electronAPI.onceEnergyPlusExit) {
                epExitListener =
                    window.electronAPI.onceEnergyPlusExit(
                        handleExit
                    );
            } else if (
                window.electronAPI.onEnergyPlusExit
            ) {
                epExitListener =
                    window.electronAPI.onEnergyPlusExit(
                        handleExit
                    );
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
    let panel = document.getElementById(panelId);
    if (!panel) {
        panel = createZoneLoadsManagerPanel();
        document.getElementById('window-container').appendChild(panel);
    }
    panel.classList.remove('hidden');
    panel.style.zIndex = getNewZIndex();
}

function createZoneLoadsManagerPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-energyplus-zone-loads';
    panel.className = 'floating-window ui-panel resizable-panel';

    panel.innerHTML = `
        <div class="window-header">
            <span>Zone Loads</span>
            <!-- Help button removed -->
            <div class="window-controls">
                <div class="window-icon-max" title="Maximize/Restore"></div>
                <div class="collapse-icon" title="Minimize"></div>
                <div class="window-icon-close" title="Close"></div>
            </div>
        </div>
        <div class="window-content space-y-2">
            <div class="resize-handle-edge top"></div>
            <div class="resize-handle-edge right"></div>
            <div class="resize-handle-edge bottom"></div>
            <div class="resize-handle-edge left"></div>
            <div class="resize-handle-corner top-left"></div>
            <div class="resize-handle-corner top-right"></div>
            <div class="resize-handle-corner bottom-left"></div>
            <div class="resize-handle-corner bottom-right"></div>
            <p class="info-box !text-xs !py-1.5 !px-2">
                Configure per-zone internal loads (people, lighting, equipment, infiltration).
                Values are stored in <code>energyPlusConfig.zoneLoads</code>.
            </p>

            <div class="border border-gray-700/70 rounded bg-black/40 p-2 space-y-1">
                <div class="flex justify-between items-center gap-2">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">Template (Apply to all zones)</span>
                    <button class="btn btn-xxs btn-secondary" data-action="apply-template">Apply to all zones</button>
                </div>
                <div class="grid grid-cols-4 gap-1 mt-1 text-xs">
                    <div>
                        <label class="label !text-xs">People [p/m²]</label>
                        <input type="number" step="0.01" class="w-full text-xs" data-template="peoplePerArea">
                    </div>
                    <div>
                        <label class="label !text-xs">Lights [W/m²]</label>
                        <input type="number" step="0.1" class="w-full text-xs" data-template="lightsWm2">
                    </div>
                    <div>
                        <label class="label !text-xs">Equip [W/m²]</label>
                        <input type="number" step="0.1" class="w-full text-xs" data-template="equipWm2">
                    </div>
                    <div>
                        <label class="label !text-xs">Infil [ACH]</label>
                        <input type="number" step="0.1" class="w-full text-xs" data-template="infilAch">
                    </div>
                </div>
                <div class="grid grid-cols-4 gap-1 mt-1 text-xs">
                    <div>
                        <label class="label !text-xs">People Sched</label>
                        <select class="w-full text-xs" data-template="peopleSched"></select>
                    </div>
                    <div>
                        <label class="label !text-xs">Lights Sched</label>
                        <select class="w-full text-xs" data-template="lightsSched"></select>
                    </div>
                    <div>
                        <label class="label !text-xs">Equip Sched</label>
                        <select class="w-full text-xs" data-template="equipSched"></select>
                    </div>
                    <div>
                        <label class="label !text-xs">Infil Sched</label>
                        <select class="w-full text-xs" data-template="infilSched"></select>
                    </div>
                </div>
            </div>

            <div class="border border-gray-700/70 rounded bg-black/40 max-h-72 overflow-y-auto **scrollable-panel-inner**">
                <table class="w-full text-xs zone-loads-table">
                    <thead class="bg-black/40">
                        <tr>
                            <th class="px-1 py-1 text-left">Zone</th>
                            <th class="px-1 py-1 text-left">People [p/m²] / Sched</th>
                            <th class="px-1 py-1 text-left">Lights [W/m²] / Sched</th>
                            <th class="px-1 py-1 text-left">Equip [W/m²] / Sched</th>
                            <th class="px-1 py-1 text-left">Infil [ACH] / Sched</th>
                        </tr>
                    </thead>
                    <tbody class="zone-loads-tbody"></tbody>
                </table>
            </div>

            <div class="flex justify-end gap-2 mt-1">
                <button class="btn btn-xxs btn-secondary" data-action="save-zone-config">
                    Save Configuration
                </button>
            </div>

            <div class="text-xs text-[--text-secondary]">
                Notes:
                <ul class="list-disc pl-4 space-y-0.5">
                    <li>Loads are stored per zone in <code>zoneLoads</code> (one entry per zone).</li>
                </ul>
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

    const tbody = panel.querySelector('.zone-loads-tbody');
    const headerHelp = panel.querySelector('[data-action="open-help-loads"]');
    // Header Loads help button disabled
    // if (headerHelp) {
    //     headerHelp.addEventListener('click', () => openHelpPanel('config/loads'));
    // }
    const applyTemplateBtn = panel.querySelector('[data-action="apply-template"]');
    const saveBtn = panel.querySelector('[data-action="save-zone-config"]');

    function getMetaAndEP() {
        const meta =
            (typeof project.getMetadata === 'function' && project.getMetadata()) ||
            project.metadata ||
            {};
        const ep = meta.energyPlusConfig || meta.energyplus || {};
        return { meta, ep };
    }

    function getZones() {
        const { meta } = getMetaAndEP();
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

    function buildIndexes(ep) {
        const zoneLoadsIndex = new Map();
        if (Array.isArray(ep.zoneLoads)) {
            ep.zoneLoads.forEach((zl) => {
                if (zl && zl.zoneName) {
                    zoneLoadsIndex.set(String(zl.zoneName), zl);
                }
            });
        }
        return { zoneLoadsIndex };
    }

    function fillTemplateScheduleOptions(ep) {
        const schedNames = getScheduleNames(ep);
        const templSelects = panel.querySelectorAll('[data-template]');
        templSelects.forEach((sel) => {
            if (!(sel instanceof HTMLSelectElement)) return;
            const key = sel.getAttribute('data-template') || '';
            sel.innerHTML = '';
            const allowBlank = key === 'heatSpSched' || key === 'coolSpSched' || key === 'ilAvail';
            if (allowBlank) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = '(none)';
                sel.appendChild(opt);
            }
            schedNames.forEach((nm) => {
                const opt = document.createElement('option');
                opt.value = nm;
                opt.textContent = nm;
                sel.appendChild(opt);
            });
        });
    }

    function render() {
        const { ep } = getMetaAndEP();
        const zones = getZones();
        const schedNames = getScheduleNames(ep);
        const { zoneLoadsIndex } = buildIndexes(ep);

        // Template selects
        fillTemplateScheduleOptions(ep);

        tbody.innerHTML = '';
        zones.forEach((z) => {
            const zn = String(z.name);
            const zl = zoneLoadsIndex.get(zn) || {};

            const tr = document.createElement('tr');
            tr.dataset.zoneName = zn;

            const schedOptions = (selected) => {
                let html = `<option value="">(none)</option>`;
                schedNames.forEach((nm) => {
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
                        const val = m;
                        const sel = m === selected ? ' selected' : '';
                        return `<option value="${val}"${sel}>${label}</option>`;
                    })
                    .join('');
            };

            tr.innerHTML = `
                <td class="px-1 py-1 align-top text-[--accent-color]">${zn}</td>

                <td class="px-1 py-1 align-top">
                    <input type="number" step="0.01"
                        class="w-full text-xs mb-0.5"
                        data-field="peoplePerArea"
                        value="${zl.people?.peoplePerArea ?? ''}">
                    <select class="w-full text-xs" data-field="peopleSched">
                        ${schedOptions(zl.people?.schedule || '')}
                    </select>
                </td>

                <td class="px-1 py-1 align-top">
                    <input type="number" step="0.1"
                        class="w-full text-xs mb-0.5"
                        data-field="lightsWm2"
                        value="${zl.lighting?.wattsPerArea ?? ''}">
                    <select class="w-full text-xs" data-field="lightsSched">
                        ${schedOptions(zl.lighting?.schedule || '')}
                    </select>
                </td>

                <td class="px-1 py-1 align-top">
                    <input type="number" step="0.1"
                        class="w-full text-xs mb-0.5"
                        data-field="equipWm2"
                        value="${zl.equipment?.wattsPerArea ?? ''}">
                    <select class="w-full text-xs" data-field="equipSched">
                        ${schedOptions(zl.equipment?.schedule || '')}
                    </select>
                </td>

                <td class="px-1 py-1 align-top">
                    <input type="number" step="0.1"
                        class="w-full text-xs mb-0.5"
                        data-field="infilAch"
                        value="${zl.infiltration?.ach ?? ''}">
                    <select class="w-full text-xs" data-field="infilSched">
                        ${schedOptions(zl.infiltration?.schedule || '')}
                    </select>
                </td>

            `;

            tbody.appendChild(tr);
        });
    }

    function collectTemplateValues() {
        const obj = {};
        const root = panel;
        const num = (sel) => {
            const el = root.querySelector(`[data-template="${sel}"]`);
            if (!el) return undefined;
            const v = parseFloat(el.value);
            return Number.isFinite(v) ? v : undefined;
        };
        const str = (sel) => {
            const el = root.querySelector(`[data-template="${sel}"]`);
            if (!el) return undefined;
            const v = (el.value || '').trim();
            return v || undefined;
        };

        obj.peoplePerArea = num('peoplePerArea');
        obj.lightsWm2 = num('lightsWm2');
        obj.equipWm2 = num('equipWm2');
        obj.infilAch = num('infilAch');

        obj.peopleSched = str('peopleSched');
        obj.lightsSched = str('lightsSched');
        obj.equipSched = str('equipSched');
        obj.infilSched = str('infilSched');

        obj.heatSpSched = str('heatSpSched');
        obj.coolSpSched = str('coolSpSched');
        obj.ilAvail = str('ilAvail');
        obj.ilHeatCap = num('ilHeatCap');
        obj.ilCoolCap = num('ilCoolCap');
        obj.ilOaMethod = str('ilOaMethod');
        obj.ilOaPerPerson = num('ilOaPerPerson');
        obj.ilOaPerArea = num('ilOaPerArea');
        obj.ilAvail = str('ilAvail');
        obj.ilHeatCap = num('ilHeatCap');
        obj.ilCoolCap = num('ilCoolCap');
        obj.ilOaMethod = str('ilOaMethod');
        obj.ilOaPerPerson = num('ilOaPerPerson');
        obj.ilOaPerArea = num('ilOaPerArea');

        return obj;
    }

    function applyTemplateToAllZones() {
        const tmpl = collectTemplateValues();
        const rows = tbody.querySelectorAll('tr[data-zone-name]');
        rows.forEach((tr) => {
            const setVal = (sel, val) => {
                if (val === undefined) return;
                const el = tr.querySelector(sel);
                if (el) el.value = val;
            };
            const setNum = (sel, val) => {
                if (val === undefined) return;
                const el = tr.querySelector(sel);
                if (el) el.value = val;
            };

            setNum('[data-field="peoplePerArea"]', tmpl.peoplePerArea);
            setVal('[data-field="peopleSched"]', tmpl.peopleSched);

            setNum('[data-field="lightsWm2"]', tmpl.lightsWm2);
            setVal('[data-field="lightsSched"]', tmpl.lightsSched);

            setNum('[data-field="equipWm2"]', tmpl.equipWm2);
            setVal('[data-field="equipSched"]', tmpl.equipSched);

            setNum('[data-field="infilAch"]', tmpl.infilAch);
            setVal('[data-field="infilSched"]', tmpl.infilSched);
        });
    }

    function buildNextConfigFromUI() {
        const { meta, ep } = getMetaAndEP();
        const rows = Array.from(
            tbody.querySelectorAll('tr[data-zone-name]')
        );
        const zones = rows.map((tr) => tr.dataset.zoneName);

        const nextZoneLoads = [];

        // Collect per-zone values
        rows.forEach((tr) => {
            const zn = tr.dataset.zoneName;

            const num = (sel) => {
                const el = tr.querySelector(sel);
                if (!el) return undefined;
                const v = parseFloat(el.value);
                return Number.isFinite(v) ? v : undefined;
            };
            const str = (sel) => {
                const el = tr.querySelector(sel);
                if (!el) return undefined;
                const v = (el.value || '').trim();
                return v || undefined;
            };

            const peoplePerArea = num('[data-field="peoplePerArea"]');
            const peopleSched = str('[data-field="peopleSched"]');

            const lightsWm2 = num('[data-field="lightsWm2"]');
            const lightsSched = str('[data-field="lightsSched"]');

            const equipWm2 = num('[data-field="equipWm2"]');
            const equipSched = str('[data-field="equipSched"]');

            const infilAch = num('[data-field="infilAch"]');
            const infilSched = str('[data-field="infilSched"]');

            if (
                peoplePerArea != null ||
                lightsWm2 != null ||
                equipWm2 != null ||
                infilAch != null
            ) {
                const zl = { zoneName: zn };
                if (peoplePerArea != null) {
                    zl.people = {
                        peoplePerArea,
                        schedule: peopleSched,
                    };
                }
                if (lightsWm2 != null) {
                    zl.lighting = {
                        wattsPerArea: lightsWm2,
                        schedule: lightsSched,
                    };
                }
                if (equipWm2 != null) {
                    zl.equipment = {
                        wattsPerArea: equipWm2,
                        schedule: equipSched,
                    };
                }
                if (infilAch != null) {
                    zl.infiltration = {
                        ach: infilAch,
                        schedule: infilSched,
                    };
                }
                nextZoneLoads.push(zl);
            }

        });

        const nextConfig = {
            ...ep,
            zoneLoads: nextZoneLoads,
        };

        return { meta, nextConfig };
    }

    if (applyTemplateBtn) {
        applyTemplateBtn.addEventListener('click', () => {
            applyTemplateToAllZones();
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            try {
                const { meta, nextConfig } = buildNextConfigFromUI();
                if (typeof project.updateMetadata === 'function') {
                    project.updateMetadata({
                        ...meta,
                        energyPlusConfig: nextConfig,
                    });
                } else {
                    project.metadata = {
                        ...(project.metadata || meta),
                        energyPlusConfig: nextConfig,
                    };
                }
                alert('Zone loads configuration saved.');
            } catch (err) {
                console.error('EnergyPlus Zone Manager: save failed', err);
                alert('Failed to save configuration. Check console for details.');
            }
        });
    }

    render();

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
                                    `<option value="${n}"${cfg.designSpecOutdoorAirName === n ? ' selected' : ''
                                    }>${n}</option>`
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

function openDaylightingManagerPanel() {
    const panelId = 'panel-energyplus-daylighting';
    let panel = document.getElementById(panelId);
    if (!panel) {
        panel = createDaylightingManagerPanel();
        document.getElementById('window-container').appendChild(panel);
    }
    panel.classList.remove('hidden');
    panel.style.zIndex = getNewZIndex();
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
                            <option value="SingleHeatingOrCooling"${type === 'SingleHeatingOrCooling' ? ' selected' : ''
                    }>SingleHeatingOrCooling</option>
                            <option value="DualSetpoint"${type === 'DualSetpoint' || !type ? ' selected' : ''
                    }>DualSetpoint</option>
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

function openOutdoorAirManagerPanel() {
    const panelId = 'panel-energyplus-outdoor-air';
    let panel = document.getElementById(panelId);
    if (!panel) {
        panel = createOutdoorAirManagerPanel();
        document.getElementById('window-container').appendChild(panel);
    }
    panel.classList.remove('hidden');
    panel.style.zIndex = getNewZIndex();
}

/**
 * Outdoor Air & Ventilation Manager
 * - DesignSpecification:OutdoorAir (energyPlusConfig.outdoorAir.designSpecs)
 * - Natural Ventilation via ZoneVentilation:DesignFlowRate (energyPlusConfig.naturalVentilation)
 */
function createOutdoorAirManagerPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-energyplus-outdoor-air';
    panel.className = 'floating-window ui-panel resizable-panel';

    panel.innerHTML = `
        <div class="window-header">
            <span>Outdoor Air & Ventilation</span>
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
                Configure outdoor air design specs and simple natural ventilation.
                Settings are stored in <code>energyPlusConfig.outdoorAir</code> and
                <code>energyPlusConfig.naturalVentilation</code> and consumed by the model builder.
                If left empty, no additional DesignSpecification:OutdoorAir or ZoneVentilation objects are emitted.
            </p>

            <!-- DesignSpecification:OutdoorAir -->
            <div class="border border-gray-700/70 rounded bg-black/40 p-2 space-y-1">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">
                        Outdoor Air Design Specs (DesignSpecification:OutdoorAir)
                    </span>
                    <button class="btn btn-xxs btn-secondary" data-action="add-dsoa">+ Add Design Spec</button>
                </div>
                <div class="max-h-40 overflow-y-auto scrollable-panel-inner">
                    <table class="w-full text-xs">
                        <thead class="bg-black/40">
                            <tr>
                                <th class="px-1 py-1 text-left">Name</th>
                                <th class="px-1 py-1 text-left">Method</th>
                                <th class="px-1 py-1 text-left">Flow/Person</th>
                                <th class="px-1 py-1 text-left">Flow/Area</th>
                                <th class="px-1 py-1 text-left">Flow/Zone</th>
                                <th class="px-1 py-1 text-left">ACH</th>
                                <th class="px-1 py-1 text-left">Schedule</th>
                                <th class="px-1 py-1 text-left">Min OA Frac Sched</th>
                                <th class="px-1 py-1 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="dsoa-tbody"></tbody>
                    </table>
                </div>
                <p class="text-xs text-[--text-secondary] mt-1">
                    Refer to these specs from HVAC Sizing and IdealLoads configuration (e.g. DesignSpecification:OutdoorAir Name).
                </p>
            </div>

            <!-- Natural Ventilation (ZoneVentilation:DesignFlowRate) -->
            <div class="border border-gray-700/70 rounded bg-black/40 p-2 space-y-2">
                <div class="font-semibold text-xs uppercase text-[--text-secondary]">
                    Natural Ventilation (ZoneVentilation:DesignFlowRate)
                </div>

                <!-- Global defaults -->
                <div class="space-y-1">
                    <label class="inline-flex items-center gap-1">
                        <input type="checkbox" data-field="nv-global-enabled">
                        <span>Enable global natural ventilation</span>
                    </label>
                    <div class="grid grid-cols-5 gap-1 mt-1">
                        <div>
                            <label class="label !text-xs">Method</label>
                            <select class="w-full" data-field="nv-global-method">
                                <option value="">(none)</option>
                                <option value="Flow/Zone">Flow/Zone</option>
                                <option value="Flow/Area">Flow/Area</option>
                                <option value="Flow/Person">Flow/Person</option>
                                <option value="AirChanges/Hour">AirChanges/Hour</option>
                            </select>
                        </div>
                        <div>
                            <label class="label !text-xs">Flow/Zone [m³/s]</label>
                            <input type="number" step="0.001" class="w-full" data-field="nv-global-flowZone">
                        </div>
                        <div>
                            <label class="label !text-xs">Flow/Area [m³/s-m²]</label>
                            <input type="number" step="0.0001" class="w-full" data-field="nv-global-flowArea">
                        </div>
                        <div>
                            <label class="label !text-xs">Flow/Person [m³/s-person]</label>
                            <input type="number" step="0.0001" class="w-full" data-field="nv-global-flowPerson">
                        </div>
                        <div>
                            <label class="label !text-xs">ACH [1/h]</label>
                            <input type="number" step="0.01" class="w-full" data-field="nv-global-ach">
                        </div>
                    </div>
                    <div class="grid grid-cols-6 gap-1 mt-1">
                        <div>
                            <label class="label !text-xs">Type</label>
                            <select class="w-full" data-field="nv-global-type">
                                <option value="">(Natural)</option>
                                <option value="Natural">Natural</option>
                                <option value="Exhaust">Exhaust</option>
                                <option value="Intake">Intake</option>
                                <option value="Balanced">Balanced</option>
                            </select>
                        </div>
                        <div>
                            <label class="label !text-xs">Min Tin [°C]</label>
                            <input type="number" step="0.1" class="w-full" data-field="nv-global-minTin">
                        </div>
                        <div>
                            <label class="label !text-xs">Max Tin [°C]</label>
                            <input type="number" step="0.1" class="w-full" data-field="nv-global-maxTin">
                        </div>
                        <div>
                            <label class="label !text-xs">Min Tout [°C]</label>
                            <input type="number" step="0.1" class="w-full" data-field="nv-global-minTout">
                        </div>
                        <div>
                            <label class="label !text-xs">Max Tout [°C]</label>
                            <input type="number" step="0.1" class="w-full" data-field="nv-global-maxTout">
                        </div>
                        <div>
                            <label class="label !text-xs">ΔT (Tin-Tout) [K]</label>
                            <input type="number" step="0.1" class="w-full" data-field="nv-global-deltaT">
                        </div>
                    </div>
                    <div class="grid grid-cols-4 gap-1 mt-1">
                        <div>
                            <label class="label !text-xs">Max Wind [m/s]</label>
                            <input type="number" step="0.1" class="w-full" data-field="nv-global-maxWind">
                        </div>
                        <div>
                            <label class="label !text-xs">Density Basis</label>
                            <select class="w-full" data-field="nv-global-density">
                                <option value="">(default)</option>
                                <option value="Outdoor">Outdoor</option>
                                <option value="Indoor">Indoor</option>
                                <option value="Standard">Standard</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Per-zone overrides -->
                <div class="border border-gray-700/70 rounded bg-black/30 p-1 space-y-1">
                    <div class="font-semibold text-xs text-[--text-secondary]">
                        Per-Zone Overrides
                    </div>
                    <div class="max-h-40 overflow-y-auto scrollable-panel-inner">
                        <table class="w-full text-xs">
                            <thead class="bg-black/40">
                                <tr>
                                    <th class="px-1 py-1 text-left">Zone</th>
                                    <th class="px-1 py-1 text-left">Override</th>
                                    <th class="px-1 py-1 text-left">Enable</th>
                                    <th class="px-1 py-1 text-left">Method</th>
                                    <th class="px-1 py-1 text-left">Flow/Zone</th>
                                    <th class="px-1 py-1 text-left">Flow/Area</th>
                                    <th class="px-1 py-1 text-left">Flow/Person</th>
                                    <th class="px-1 py-1 text-left">ACH</th>
                                </tr>
                            </thead>
                            <tbody class="nv-zones-tbody"></tbody>
                        </table>
                    </div>
                    <p class="text-xs text-[--text-secondary]">
                        Only rows with "Override" checked and at least one field set are saved.
                        Zones without overrides inherit the global settings if enabled.
                    </p>
                </div>

                <div class="flex justify-end">
                    <button class="btn btn-xxs btn-secondary" data-action="save-outdoor-air">
                        Save Outdoor Air & Ventilation
                    </button>
                </div>
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

    // Wire data loading/saving via energyplusConfigService
    import('./energyplusConfigService.js')
        .then(({ getConfig, setOutdoorAirDesignSpecs, setNaturalVentilation }) => {
            const dsoaTbody = panel.querySelector('.dsoa-tbody');
            const nvZonesTbody = panel.querySelector('.nv-zones-tbody');
            const addDsoaBtn = panel.querySelector('[data-action="add-dsoa"]');
            const saveBtn = panel.querySelector('[data-action="save-outdoor-air"]');

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

            function loadState() {
                const { config } = getConfig(project);
                const oa = config.outdoorAir || {};
                const nat = config.naturalVentilation || {};
                return {
                    designSpecs: Array.isArray(oa.designSpecs) ? oa.designSpecs.slice() : [],
                    naturalVentilation: nat,
                };
            }

            function renderDsoa() {
                const { designSpecs } = loadState();
                dsoaTbody.innerHTML = '';
                if (!designSpecs.length) {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="px-1 py-1 text-white" colspan="9">
                            No DesignSpecification:OutdoorAir defined.
                        </td>
                    `;
                    dsoaTbody.appendChild(tr);
                    return;
                }
                designSpecs.forEach((d, idx) => {
                    const tr = document.createElement('tr');
                    tr.dataset.index = String(idx);
                    tr.innerHTML = `
                        <td class="px-1 py-1 align-top">
                            <input class="w-full" data-field="name" value="${d.name || ''}">
                        </td>
                        <td class="px-1 py-1 align-top">
                            <select class="w-full" data-field="method">
                                ${[
                            '',
                            'Flow/Person',
                            'Flow/Area',
                            'Flow/Zone',
                            'AirChanges/Hour',
                            'Sum',
                            'Maximum',
                        ]
                            .map((m) => {
                                const label = m || '(auto)';
                                const sel = d.method === m ? ' selected' : '';
                                return `<option value="${m}"${sel}>${label}</option>`;
                            })
                            .join('')}
                            </select>
                        </td>
                        <td class="px-1 py-1 align-top">
                            <input type="number" step="0.0001" class="w-full" data-field="flowPerPerson" value="${d.flowPerPerson ?? ''}">
                        </td>
                        <td class="px-1 py-1 align-top">
                            <input type="number" step="0.0001" class="w-full" data-field="flowPerArea" value="${d.flowPerArea ?? ''}">
                        </td>
                        <td class="px-1 py-1 align-top">
                            <input type="number" step="0.0001" class="w-full" data-field="flowPerZone" value="${d.flowPerZone ?? ''}">
                        </td>
                        <td class="px-1 py-1 align-top">
                            <input type="number" step="0.01" class="w-full" data-field="ach" value="${d.airChangesPerHour ?? ''}">
                        </td>
                        <td class="px-1 py-1 align-top">
                            <input class="w-full" data-field="sched" value="${d.scheduleName || ''}">
                        </td>
                        <td class="px-1 py-1 align-top">
                            <input class="w-full" data-field="minFracSched" value="${d.proportionalMinOAFractionScheduleName || ''}">
                        </td>
                        <td class="px-1 py-1 align-top text-right">
                            <button class="btn btn-xxs btn-danger" data-action="delete-dsoa">Del</button>
                        </td>
                    `;
                    dsoaTbody.appendChild(tr);
                });

                dsoaTbody.querySelectorAll('button[data-action="delete-dsoa"]').forEach((btn, idx) => {
                    btn.addEventListener('click', () => {
                        const { designSpecs } = loadState();
                        designSpecs.splice(idx, 1);
                        setOutdoorAirDesignSpecs(project, designSpecs);
                        renderDsoa();
                    });
                });
            }

            function renderNaturalVentilation() {
                const { naturalVentilation } = loadState();
                const zones = getZones();
                const global = naturalVentilation.global || {};
                const perZone = Array.isArray(naturalVentilation.perZone)
                    ? naturalVentilation.perZone
                    : [];

                // Global
                const gEnabled = !!global.enabled;
                const set = (sel, v) => {
                    const el = panel.querySelector(sel);
                    if (!el) return;
                    if (el.type === 'checkbox') el.checked = !!v;
                    else el.value = v != null ? String(v) : '';
                };

                set('[data-field="nv-global-enabled"]', gEnabled);
                set('[data-field="nv-global-method"]', global.calculationMethod || '');
                set('[data-field="nv-global-flowZone"]', global.designFlowRate);
                set('[data-field="nv-global-flowArea"]', global.flowPerArea);
                set('[data-field="nv-global-flowPerson"]', global.flowPerPerson);
                set('[data-field="nv-global-ach"]', global.airChangesPerHour);
                set('[data-field="nv-global-type"]', global.ventilationType || '');
                set('[data-field="nv-global-minTin"]', global.minIndoorTemp);
                set('[data-field="nv-global-maxTin"]', global.maxIndoorTemp);
                set('[data-field="nv-global-minTout"]', global.minOutdoorTemp);
                set('[data-field="nv-global-maxTout"]', global.maxOutdoorTemp);
                set('[data-field="nv-global-deltaT"]', global.deltaTemp);
                set('[data-field="nv-global-maxWind"]', global.maxWindSpeed);
                set('[data-field="nv-global-density"]', global.densityBasis || '');

                // Per-zone
                nvZonesTbody.innerHTML = '';
                zones.forEach((z) => {
                    const zn = String(z.name);
                    const entry = perZone.find((p) => p.zoneName === zn) || {};
                    const tr = document.createElement('tr');
                    tr.dataset.zoneName = zn;
                    tr.innerHTML = `
                        <td class="px-1 py-1 align-top text-[--accent-color]">${zn}</td>
                        <td class="px-1 py-1 align-top">
                            <input type="checkbox" data-field="override" ${entry.zoneName ? 'checked' : ''}>
                        </td>
                        <td class="px-1 py-1 align-top">
                            <input type="checkbox" data-field="enabled" ${entry.enabled ? 'checked' : ''}>
                        </td>
                        <td class="px-1 py-1 align-top">
                            <select class="w-full" data-field="method">
                                ${[
                            '',
                            'Flow/Zone',
                            'Flow/Area',
                            'Flow/Person',
                            'AirChanges/Hour',
                        ]
                            .map((m) => {
                                const label = m || '(inherit)';
                                const sel = entry.calculationMethod === m ? ' selected' : '';
                                return `<option value="${m}"${sel}>${label}</option>`;
                            })
                            .join('')}
                            </select>
                        </td>
                        <td class="px-1 py-1 align-top">
                            <input type="number" step="0.001" class="w-full" data-field="flowZone" value="${entry.designFlowRate ?? ''}">
                        </td>
                        <td class="px-1 py-1 align-top">
                            <input type="number" step="0.0001" class="w-full" data-field="flowArea" value="${entry.flowPerArea ?? ''}">
                        </td>
                        <td class="px-1 py-1 align-top">
                            <input type="number" step="0.0001" class="w-full" data-field="flowPerson" value="${entry.flowPerPerson ?? ''}">
                        </td>
                        <td class="px-1 py-1 align-top">
                            <input type="number" step="0.01" class="w-full" data-field="ach" value="${entry.airChangesPerHour ?? ''}">
                        </td>
                    `;
                    nvZonesTbody.appendChild(tr);
                });
            }

            function collectDsoaFromUI() {
                const rows = dsoaTbody.querySelectorAll('tr');
                const specs = [];
                rows.forEach((tr) => {
                    const name = (tr.querySelector('[data-field="name"]')?.value || '').trim();
                    if (!name) return;
                    const method = (tr.querySelector('[data-field="method"]')?.value || '').trim();
                    const num = (field) => {
                        const el = tr.querySelector(field);
                        if (!el) return undefined;
                        const v = parseFloat(el.value);
                        return Number.isFinite(v) ? v : undefined;
                    };
                    const sched = (tr.querySelector('[data-field="sched"]')?.value || '').trim();
                    const minFracSched = (tr.querySelector('[data-field="minFracSched"]')?.value || '').trim();
                    const spec = { name };
                    if (method) spec.method = method;
                    const fpp = num('[data-field="flowPerPerson"]');
                    if (fpp != null) spec.flowPerPerson = fpp;
                    const fpa = num('[data-field="flowPerArea"]');
                    if (fpa != null) spec.flowPerArea = fpa;
                    const fpz = num('[data-field="flowPerZone"]');
                    if (fpz != null) spec.flowPerZone = fpz;
                    const ach = num('[data-field="ach"]');
                    if (ach != null) spec.airChangesPerHour = ach;
                    if (sched) spec.scheduleName = sched;
                    if (minFracSched) spec.proportionalMinOAFractionScheduleName = minFracSched;
                    specs.push(spec);
                });
                return specs;
            }

            function collectNaturalVentilationFromUI() {
                const nv = {};

                const gEnabled = panel.querySelector('[data-field="nv-global-enabled"]')?.checked;
                if (gEnabled) {
                    const method = (panel.querySelector('[data-field="nv-global-method"]')?.value || '').trim();
                    const num = (sel) => {
                        const el = panel.querySelector(sel);
                        if (!el) return undefined;
                        const v = parseFloat(el.value);
                        return Number.isFinite(v) ? v : undefined;
                    };
                    const val = (sel) => {
                        const el = panel.querySelector(sel);
                        return (el && el.value || '').trim() || undefined;
                    };
                    const global = { enabled: true };
                    if (method) global.calculationMethod = method;
                    const fz = num('[data-field="nv-global-flowZone"]');
                    if (fz != null) global.designFlowRate = fz;
                    const fa = num('[data-field="nv-global-flowArea"]');
                    if (fa != null) global.flowPerArea = fa;
                    const fp = num('[data-field="nv-global-flowPerson"]');
                    if (fp != null) global.flowPerPerson = fp;
                    const ach = num('[data-field="nv-global-ach"]');
                    if (ach != null) global.airChangesPerHour = ach;
                    const vt = val('[data-field="nv-global-type"]');
                    if (vt) global.ventilationType = vt;
                    const minTin = num('[data-field="nv-global-minTin"]');
                    if (minTin != null) global.minIndoorTemp = minTin;
                    const maxTin = num('[data-field="nv-global-maxTin"]');
                    if (maxTin != null) global.maxIndoorTemp = maxTin;
                    const minTout = num('[data-field="nv-global-minTout"]');
                    if (minTout != null) global.minOutdoorTemp = minTout;
                    const maxTout = num('[data-field="nv-global-maxTout"]');
                    if (maxTout != null) global.maxOutdoorTemp = maxTout;
                    const dT = num('[data-field="nv-global-deltaT"]');
                    if (dT != null) global.deltaTemp = dT;
                    const maxWind = num('[data-field="nv-global-maxWind"]');
                    if (maxWind != null) global.maxWindSpeed = maxWind;
                    const dens = val('[data-field="nv-global-density"]');
                    if (dens) global.densityBasis = dens;
                    nv.global = global;
                }

                const perZone = [];
                nvZonesTbody.querySelectorAll('tr[data-zone-name]').forEach((tr) => {
                    const zn = tr.dataset.zoneName;
                    const override = tr.querySelector('[data-field="override"]')?.checked;
                    if (!override || !zn) return;
                    const enabled = tr.querySelector('[data-field="enabled"]')?.checked;
                    const method = (tr.querySelector('[data-field="method"]')?.value || '').trim();
                    const num = (sel) => {
                        const el = tr.querySelector(sel);
                        if (!el) return undefined;
                        const v = parseFloat(el.value);
                        return Number.isFinite(v) ? v : undefined;
                    };
                    const entry = { zoneName: zn };
                    if (enabled) entry.enabled = true;
                    if (method) entry.calculationMethod = method;
                    const fz = num('[data-field="flowZone"]');
                    if (fz != null) entry.designFlowRate = fz;
                    const fa = num('[data-field="flowArea"]');
                    if (fa != null) entry.flowPerArea = fa;
                    const fp = num('[data-field="flowPerson"]');
                    if (fp != null) entry.flowPerPerson = fp;
                    const ach = num('[data-field="ach"]');
                    if (ach != null) entry.airChangesPerHour = ach;

                    // Only keep if there is at least one meaningful override
                    if (
                        entry.enabled ||
                        entry.calculationMethod ||
                        entry.designFlowRate != null ||
                        entry.flowPerArea != null ||
                        entry.flowPerPerson != null ||
                        entry.airChangesPerHour != null
                    ) {
                        perZone.push(entry);
                    }
                });

                if (perZone.length) {
                    nv.perZone = perZone;
                }

                return nv;
            }

            function addDsoaRow() {
                // Append a blank row; actual persistence happens on Save.
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="px-1 py-1 align-top">
                        <input class="w-full" data-field="name" placeholder="Name">
                    </td>
                    <td class="px-1 py-1 align-top">
                        <select class="w-full" data-field="method">
                            <option value="">(auto)</option>
                            <option value="Flow/Person">Flow/Person</option>
                            <option value="Flow/Area">Flow/Area</option>
                            <option value="Flow/Zone">Flow/Zone</option>
                            <option value="AirChanges/Hour">AirChanges/Hour</option>
                            <option value="Sum">Sum</option>
                            <option value="Maximum">Maximum</option>
                        </select>
                    </td>
                    <td class="px-1 py-1 align-top">
                        <input type="number" step="0.0001" class="w-full" data-field="flowPerPerson">
                    </td>
                    <td class="px-1 py-1 align-top">
                        <input type="number" step="0.0001" class="w-full" data-field="flowPerArea">
                    </td>
                    <td class="px-1 py-1 align-top">
                        <input type="number" step="0.0001" class="w-full" data-field="flowPerZone">
                    </td>
                    <td class="px-1 py-1 align-top">
                        <input type="number" step="0.01" class="w-full" data-field="ach">
                    </td>
                    <td class="px-1 py-1 align-top">
                        <input class="w-full" data-field="sched">
                    </td>
                    <td class="px-1 py-1 align-top">
                        <input class="w-full" data-field="minFracSched">
                    </td>
                    <td class="px-1 py-1 align-top text-right">
                        <button class="btn btn-xxs btn-danger" data-action="delete-dsoa">Del</button>
                    </td>
                `;
                dsoaTbody.appendChild(tr);
                const del = tr.querySelector('button[data-action="delete-dsoa"]');
                if (del) {
                    del.addEventListener('click', () => tr.remove());
                }
            }

            // Initial render
            renderDsoa();
            renderNaturalVentilation();

            if (addDsoaBtn) {
                addDsoaBtn.addEventListener('click', () => {
                    addDsoaRow();
                });
            }

            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    try {
                        const specs = collectDsoaFromUI();
                        const nv = collectNaturalVentilationFromUI();
                        setOutdoorAirDesignSpecs(project, specs);
                        setNaturalVentilation(project, nv);
                        alert('Outdoor Air & Ventilation configuration saved.');
                        renderDsoa();
                        renderNaturalVentilation();
                    } catch (err) {
                        console.error('OutdoorAirManager: save failed', err);
                        alert('Failed to save Outdoor Air & Ventilation configuration. Check console for details.');
                    }
                });
            }
        })
        .catch((err) => {
            console.error('OutdoorAirManager: failed to load config service', err);
        });

    return panel;
}

function openShadingManagerPanel() {
    const panelId = 'panel-energyplus-shading';
    let panel = document.getElementById(panelId);
    if (!panel) {
        panel = createShadingManagerPanel();
        document.getElementById('window-container').appendChild(panel);
    }
    panel.classList.remove('hidden');
    panel.style.zIndex = getNewZIndex();
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
 *      vertices: Array<{ x: number, y: number, z: number }>
 *    }>,
 *    zoneSurfaces?: Array<{
 *      name: string,
 *      baseSurfaceName: string,
 *      transmittanceScheduleName?: string,
 *      vertices: Array<{ x: number, y: number, z: number }>
 *    }>,
 *    reflectance?: Array<{
 *      shadingSurfaceName: string,
 *      solarReflectance?: number,
 *      visibleReflectance?: number,
 *      infraredHemisphericalEmissivity?: number,
 *      infraredTransmittance?: number
 *    }>,
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
 *    }>
 *  }
 *
 * If shading is empty/missing, builder behavior is unchanged.
 */
function createShadingManagerPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-energyplus-shading';
    panel.className = 'floating-window ui-panel resizable-panel';

    panel.innerHTML = `
        <div class="window-header">
            <span>Shading & Solar Control</span>
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
                Configure explicit shading geometry, reflectance, and window shading controls.
                Settings are stored in <code>energyPlusConfig.shading</code> and consumed directly by the EnergyPlus model builder.
                If left empty, no additional shading objects are emitted.
            </p>

            <!-- Site / Building Shading Surfaces (Shading:Site:Detailed / Shading:Building:Detailed) -->
            <div class="border border-gray-700/70 rounded bg-black/40 p-2 space-y-1">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">
                        Surface / Zone Optical Properties
                    </span>
                    <button class="btn btn-xxs btn-secondary" data-action="add-surface-opt">
                        + Add Entry
                    </button>
                </div>
                <div class="border border-gray-700/70 rounded bg-black/40 max-h-40 overflow-y-auto scrollable-panel-inner">
                    <table class="w-full text-xs">
                        <thead class="bg-black/40">
                            <tr>
                                <th class="px-1 py-1 text-left">Name</th>
                                <th class="px-1 py-1 text-left">Type</th>
                                <th class="px-1 py-1 text-left">Transmittance Schedule</th>
                                <th class="px-1 py-1 text-left">#Vertices</th>
                                <th class="px-1 py-1 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="shading-site-surfaces-tbody"></tbody>
                    </table>
                </div>
                <p class="text-xs text-[--text-secondary]">
                    Defines <code>Shading:Site:Detailed</code> and <code>Shading:Building:Detailed</code> surfaces.
                    Each surface requires a name, type, and at least 3 vertices.
                </p>
            </div>

            <!-- Zone Shading Surfaces (Shading:Zone:Detailed) -->
            <div class="border border-gray-700/70 rounded bg-black/40 p-2 space-y-1">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">
                        Zone Shading Surfaces (Shading:Zone:Detailed)
                    </span>
                    <button class="btn btn-xxs btn-secondary" data-action="add-zone-surface">
                        + Add Zone Surface
                    </button>
                </div>
                <div class="border border-gray-700/70 rounded bg-black/40 max-h-32 overflow-y-auto scrollable-panel-inner">
                    <table class="w-full text-xs">
                        <thead class="bg-black/40">
                            <tr>
                                <th class="px-1 py-1 text-left">Name</th>
                                <th class="px-1 py-1 text-left">Base Surface</th>
                                <th class="px-1 py-1 text-left">Transmittance Schedule</th>
                                <th class="px-1 py-1 text-left">#Vertices</th>
                                <th class="px-1 py-1 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="shading-zone-surfaces-tbody"></tbody>
                    </table>
                </div>
                <p class="text-xs text-[--text-secondary]">
                    Defines <code>Shading:Zone:Detailed</code> attached to existing base surfaces.
                </p>
            </div>

            <!-- ShadingProperty:Reflectance -->
            <div class="border border-gray-700/70 rounded bg-black/40 p-2 space-y-1">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">
                        Shading Surface Reflectance (ShadingProperty:Reflectance)
                    </span>
                    <button class="btn btn-xxs btn-secondary" data-action="add-reflectance">
                        + Add Reflectance
                    </button>
                </div>
                <div class="border border-gray-700/70 rounded bg-black/40 max-h-32 overflow-y-auto scrollable-panel-inner">
                    <table class="w-full text-xs">
                        <thead class="bg-black/40">
                            <tr>
                                <th class="px-1 py-1 text-left">Shading Surface Name</th>
                                <th class="px-1 py-1 text-left">Solar Refl.</th>
                                <th class="px-1 py-1 text-left">Visible Refl.</th>
                                <th class="px-1 py-1 text-left">IR Emiss.</th>
                                <th class="px-1 py-1 text-left">IR Trans.</th>
                                <th class="px-1 py-1 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="shading-reflectance-tbody"></tbody>
                    </table>
                </div>
                <p class="text-xs text-[--text-secondary]">
                    Binds optical properties to named shading surfaces.
                </p>
            </div>

            <!-- Window Shading Controls (WindowShadingControl) -->
            <div class="border border-gray-700/70 rounded bg-black/40 p-2 space-y-1">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">
                        Window Shading Controls
                    </span>
                    <button class="btn btn-xxs btn-secondary" data-action="add-window-control">
                        + Add Control
                    </button>
                </div>
                <div class="border border-gray-700/70 rounded bg-black/40 max-h-40 overflow-y-auto scrollable-panel-inner">
                    <table class="w-full text-xs">
                        <thead class="bg-black/40">
                            <tr>
                                <th class="px-1 py-1 text-left">Name</th>
                                <th class="px-1 py-1 text-left">Shading Type</th>
                                <th class="px-1 py-1 text-left">Control Type</th>
                                <th class="px-1 py-1 text-left">Schedule</th>
                                <th class="px-1 py-1 text-left">Setpoint 1</th>
                                <th class="px-1 py-1 text-left">Setpoint 2</th>
                                <th class="px-1 py-1 text-left">Glare Active</th>
                                <th class="px-1 py-1 text-left">Multi-Surface Type</th>
                                <th class="px-1 py-1 text-left">Fenestration Names (comma-separated)</th>
                                <th class="px-1 py-1 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="shading-window-controls-tbody"></tbody>
                    </table>
                </div>
                <p class="text-xs text-[--text-secondary]">
                    Directly defines <code>WindowShadingControl</code> objects. All referenced fenestration surfaces must exist in the IDF.
                </p>
            </div>

            <div class="flex justify-end">
                <button class="btn btn-xxs btn-secondary" data-action="save-shading">
                    Save Shading & Solar Control
                </button>
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

    const siteSurfacesTbody = panel.querySelector('.shading-site-surfaces-tbody');
    const zoneSurfacesTbody = panel.querySelector('.shading-zone-surfaces-tbody');
    const reflectanceTbody = panel.querySelector('.shading-reflectance-tbody');
    const windowControlsTbody = panel.querySelector('.shading-window-controls-tbody');
    const addSiteSurfaceBtn = panel.querySelector('[data-action="add-surface-opt"]');
    const addZoneSurfaceBtn = panel.querySelector('[data-action="add-zone-surface"]');
    const addReflectanceBtn = panel.querySelector('[data-action="add-reflectance"]');
    const addWinCtrlBtn = panel.querySelector('[data-action="add-window-control"]');
    const saveBtn = panel.querySelector('[data-action="save-shading"]');

    function getShadingState() {
        const { config } = window.require
            ? window.require('./energyplusConfigService.js').getConfig(project)
            : (() => {
                // Fallback if require not available; mimic getConfig minimally
                const meta =
                    (typeof project.getMetadata === 'function' && project.getMetadata()) ||
                    project.metadata ||
                    {};
                const ep = meta.energyPlusConfig || meta.energyplus || {};
                return { config: { shading: ep.shading || {} } };
            })();

        const shading = config.shading || {};
        return {
            siteSurfaces: Array.isArray(shading.siteSurfaces) ? shading.siteSurfaces.slice() : [],
            zoneSurfaces: Array.isArray(shading.zoneSurfaces) ? shading.zoneSurfaces.slice() : [],
            reflectance: Array.isArray(shading.reflectance) ? shading.reflectance.slice() : [],
            windowShadingControls: Array.isArray(shading.windowShadingControls)
                ? shading.windowShadingControls.slice()
                : [],
        };
    }

    function clamp01(v) {
        if (!Number.isFinite(v)) return undefined;
        if (v < 0) return 0;
        if (v > 1) return 1;
        return v;
    }

    function renderSiteSurfaces() {
        const { siteSurfaces } = getShadingState();
        siteSurfacesTbody.innerHTML = '';

        if (!siteSurfaces.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-1 py-1 text-xs text-white" colspan="5">
                    No site/building shading surfaces defined.
                </td>
            `;
            siteSurfacesTbody.appendChild(tr);
            return;
        }

        siteSurfaces.forEach((s, idx) => {
            const tr = document.createElement('tr');
            tr.dataset.index = String(idx);
            const type = s.type === 'Building' ? 'Building' : 'Site';
            const vertexCount = Array.isArray(s.vertices) ? s.vertices.length : 0;
            tr.innerHTML = `
                <td class="px-1 py-1 align-top">
                    <input class="w-full" data-field="name" value="${s.name || ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <select class="w-full" data-field="type">
                        <option value="Site"${type === 'Site' ? ' selected' : ''}>Site</option>
                        <option value="Building"${type === 'Building' ? ' selected' : ''}>Building</option>
                    </select>
                </td>
                <td class="px-1 py-1 align-top">
                    <input class="w-full" data-field="sched" value="${s.transmittanceScheduleName || ''}">
                </td>
                <td class="px-1 py-1 align-top text-[--text-secondary]">
                    ${vertexCount || 0} (edit in JSON)
                </td>
                <td class="px-1 py-1 align-top text-right">
                    <button class="btn btn-xxs btn-danger" data-action="delete-site-surface">Delete</button>
                </td>
            `;
            siteSurfacesTbody.appendChild(tr);
        });

        siteSurfacesTbody.querySelectorAll('button[data-action="delete-site-surface"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('tr');
                if (row) row.remove();
            });
        });
    }

    function addSiteSurfaceRow() {
        if (siteSurfacesTbody.children.length === 1) {
            const only = siteSurfacesTbody.children[0];
            if (only && only.querySelector('td[colspan]')) {
                siteSurfacesTbody.innerHTML = '';
            }
        }
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-1 py-1 align-top">
                <input class="w-full" data-field="name" placeholder="Name">
            </td>
            <td class="px-1 py-1 align-top">
                <select class="w-full" data-field="type">
                    <option value="Site">Site</option>
                    <option value="Building">Building</option>
                </select>
            </td>
            <td class="px-1 py-1 align-top">
                <input class="w-full" data-field="sched" placeholder="Transmittance schedule">
            </td>
            <td class="px-1 py-1 align-top text-[--text-secondary]">
                0 (edit vertices in JSON)
            </td>
            <td class="px-1 py-1 align-top text-right">
                <button class="btn btn-xxs btn-danger" data-action="delete-site-surface">Delete</button>
            </td>
        `;
        siteSurfacesTbody.appendChild(tr);
        tr.querySelector('button[data-action="delete-site-surface"]').addEventListener('click', () => {
            tr.remove();
        });
    }

    function renderZoneSurfaces() {
        const { zoneSurfaces } = getShadingState();
        zoneSurfacesTbody.innerHTML = '';

        if (!zoneSurfaces.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-1 py-1 text-xs text-white" colspan="5">
                    No zone shading surfaces defined.
                </td>
            `;
            zoneSurfacesTbody.appendChild(tr);
            return;
        }

        zoneSurfaces.forEach((s, idx) => {
            const tr = document.createElement('tr');
            tr.dataset.index = String(idx);
            const vertexCount = Array.isArray(s.vertices) ? s.vertices.length : 0;
            tr.innerHTML = `
                <td class="px-1 py-1 align-top">
                    <input class="w-full" data-field="name" value="${s.name || ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input class="w-full" data-field="base" value="${s.baseSurfaceName || ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input class="w-full" data-field="sched" value="${s.transmittanceScheduleName || ''}">
                </td>
                <td class="px-1 py-1 align-top text-[--text-secondary]">
                    ${vertexCount || 0} (edit in JSON)
                </td>
                <td class="px-1 py-1 align-top text-right">
                    <button class="btn btn-xxs btn-danger" data-action="delete-zone-surface">Delete</button>
                </td>
            `;
            zoneSurfacesTbody.appendChild(tr);
        });

        zoneSurfacesTbody.querySelectorAll('button[data-action="delete-zone-surface"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('tr');
                if (row) row.remove();
            });
        });
    }

    function addZoneSurfaceRow() {
        if (zoneSurfacesTbody.children.length === 1) {
            const only = zoneSurfacesTbody.children[0];
            if (only && only.querySelector('td[colspan]')) {
                zoneSurfacesTbody.innerHTML = '';
            }
        }
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-1 py-1 align-top">
                <input class="w-full" data-field="name" placeholder="Name">
            </td>
            <td class="px-1 py-1 align-top">
                <input class="w-full" data-field="base" placeholder="Base Surface Name">
            </td>
            <td class="px-1 py-1 align-top">
                <input class="w-full" data-field="sched" placeholder="Transmittance schedule">
            </td>
            <td class="px-1 py-1 align-top text-[--text-secondary]">
                0 (edit vertices in JSON)
            </td>
            <td class="px-1 py-1 align-top text-right">
                <button class="btn btn-xxs btn-danger" data-action="delete-zone-surface">Delete</button>
            </td>
        `;
        zoneSurfacesTbody.appendChild(tr);
        tr.querySelector('button[data-action="delete-zone-surface"]').addEventListener('click', () => {
            tr.remove();
        });
    }

    function renderReflectance() {
        const { reflectance } = getShadingState();
        reflectanceTbody.innerHTML = '';

        if (!reflectance.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-1 py-1 text-xs text-white" colspan="6">
                    No ShadingProperty:Reflectance entries defined.
                </td>
            `;
            reflectanceTbody.appendChild(tr);
            return;
        }

        reflectance.forEach((r, idx) => {
            const tr = document.createElement('tr');
            tr.dataset.index = String(idx);
            tr.innerHTML = `
                <td class="px-1 py-1 align-top">
                    <input class="w-full" data-field="name" value="${r.shadingSurfaceName || ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input type="number" step="0.01" min="0" max="1" class="w-full" data-field="solar" value="${r.solarReflectance ?? ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input type="number" step="0.01" min="0" max="1" class="w-full" data-field="vis" value="${r.visibleReflectance ?? ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input type="number" step="0.01" min="0" max="1" class="w-full" data-field="irem" value="${r.infraredHemisphericalEmissivity ?? ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input type="number" step="0.01" min="0" max="1" class="w-full" data-field="irtr" value="${r.infraredTransmittance ?? ''}">
                </td>
                <td class="px-1 py-1 align-top text-right">
                    <button class="btn btn-xxs btn-danger" data-action="delete-reflectance">Delete</button>
                </td>
            `;
            reflectanceTbody.appendChild(tr);
        });

        reflectanceTbody.querySelectorAll('button[data-action="delete-reflectance"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('tr');
                if (row) row.remove();
            });
        });
    }

    function addReflectanceRow() {
        if (reflectanceTbody.children.length === 1) {
            const only = reflectanceTbody.children[0];
            if (only && only.querySelector('td[colspan]')) {
                reflectanceTbody.innerHTML = '';
            }
        }
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-1 py-1 align-top">
                <input class="w-full" data-field="name" placeholder="Shading surface name">
            </td>
            <td class="px-1 py-1 align-top">
                <input type="number" step="0.01" min="0" max="1" class="w-full" data-field="solar">
            </td>
            <td class="px-1 py-1 align-top">
                <input type="number" step="0.01" min="0" max="1" class="w-full" data-field="vis">
            </td>
            <td class="px-1 py-1 align-top">
                <input type="number" step="0.01" min="0" max="1" class="w-full" data-field="irem">
            </td>
            <td class="px-1 py-1 align-top">
                <input type="number" step="0.01" min="0" max="1" class="w-full" data-field="irtr">
            </td>
            <td class="px-1 py-1 align-top text-right">
                <button class="btn btn-xxs btn-danger" data-action="delete-reflectance">Delete</button>
            </td>
        `;
        reflectanceTbody.appendChild(tr);
        tr.querySelector('button[data-action="delete-reflectance"]').addEventListener('click', () => {
            tr.remove();
        });
    }

    function renderWindowControls() {
        const { windowShadingControls } = getShadingState();
        windowControlsTbody.innerHTML = '';

        if (!windowShadingControls.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-1 py-1 text-xs text-white" colspan="10">
                    No WindowShadingControl entries defined.
                </td>
            `;
            windowControlsTbody.appendChild(tr);
            return;
        }

        windowShadingControls.forEach((c, idx) => {
            const tr = document.createElement('tr');
            tr.dataset.index = String(idx);
            tr.innerHTML = `
                <td class="px-1 py-1 align-top">
                    <input class="w-full" data-field="name" value="${c.name || ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input class="w-full" data-field="shadingType" value="${c.shadingType || ''}" placeholder="InteriorShade, ExteriorScreen, etc.">
                </td>
                <td class="px-1 py-1 align-top">
                    <input class="w-full" data-field="controlType" value="${c.controlType || ''}" placeholder="OnIfHighSolar, Schedule, etc.">
                </td>
                <td class="px-1 py-1 align-top">
                    <input class="w-full" data-field="scheduleName" value="${c.scheduleName || ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input type="number" step="0.01" class="w-full" data-field="setpoint1" value="${c.setpoint1 ?? ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input type="number" step="0.01" class="w-full" data-field="setpoint2" value="${c.setpoint2 ?? ''}">
                </td>
                <td class="px-1 py-1 align-top text-center">
                    <input type="checkbox" data-field="glareActive" ${c.glareControlIsActive ? 'checked' : ''}>
                </td>
                <td class="px-1 py-1 align-top">
                    <input class="w-full" data-field="multiType" value="${c.multipleSurfaceControlType || ''}" placeholder="Sequential/Group">
                </td>
                <td class="px-1 py-1 align-top">
                    <input class="w-full" data-field="fenestration" value="${Array.isArray(c.fenestrationSurfaceNames) ? c.fenestrationSurfaceNames.join(', ') : ''}">
                </td>
                <td class="px-1 py-1 align-top text-right">
                    <button class="btn btn-xxs btn-danger" data-action="delete-window-control">Delete</button>
                </td>
            `;
            windowControlsTbody.appendChild(tr);
        });

        windowControlsTbody
            .querySelectorAll('button[data-action="delete-window-control"]')
            .forEach((btn) => {
                btn.addEventListener('click', () => {
                    const row = btn.closest('tr');
                    if (row) row.remove();
                });
            });
    }

    function addWindowControlRow() {
        if (windowControlsTbody.children.length === 1) {
            const only = windowControlsTbody.children[0];
            if (only && only.querySelector('td[colspan]')) {
                windowControlsTbody.innerHTML = '';
            }
        }
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-1 py-1 align-top">
                <input class="w-full" data-field="name" placeholder="Control name">
            </td>
            <td class="px-1 py-1 align-top">
                <input class="w-full" data-field="shadingType" placeholder="InteriorShade, ExteriorBlind, etc.">
            </td>
            <td class="px-1 py-1 align-top">
                <input class="w-full" data-field="controlType" placeholder="OnIfHighSolar, Schedule, etc.">
            </td>
            <td class="px-1 py-1 align-top">
                <input class="w-full" data-field="scheduleName" placeholder="Schedule name">
            </td>
            <td class="px-1 py-1 align-top">
                <input type="number" step="0.01" class="w-full" data-field="setpoint1" placeholder="Setpoint 1">
            </td>
            <td class="px-1 py-1 align-top">
                <input type="number" step="0.01" class="w-full" data-field="setpoint2" placeholder="Setpoint 2">
            </td>
            <td class="px-1 py-1 align-top text-center">
                <input type="checkbox" data-field="glareActive">
            </td>
            <td class="px-1 py-1 align-top">
                <input class="w-full" data-field="multiType" placeholder="Sequential/Group">
            </td>
            <td class="px-1 py-1 align-top">
                <input class="w-full" data-field="fenestration" placeholder="Win1, Win2, ...">
            </td>
            <td class="px-1 py-1 align-top text-right">
                <button class="btn btn-xxs btn-danger" data-action="delete-window-control">Delete</button>
            </td>
        `;
        windowControlsTbody.appendChild(tr);
        tr.querySelector('button[data-action="delete-window-control"]').addEventListener('click', () => {
            tr.remove();
        });
    }

    function collectAndSaveShading() {
        const { meta, ep } =
            (typeof project.getMetadata === 'function' || project.metadata)
                ? (() => {
                    const meta =
                        (typeof project.getMetadata === 'function' && project.getMetadata()) ||
                        project.metadata ||
                        {};
                    const ep = meta.energyPlusConfig || meta.energyplus || {};
                    return { meta, ep };
                })()
                : { meta: {}, ep: {} };

        // Site surfaces
        const siteSurfaces = [];
        siteSurfacesTbody.querySelectorAll('tr').forEach((tr) => {
            if (tr.querySelector('td[colspan]')) return;
            const name = (tr.querySelector('[data-field="name"]')?.value || '').trim();
            if (!name) return;
            const type = (tr.querySelector('[data-field="type"]')?.value || 'Site').trim();
            const sched = (tr.querySelector('[data-field="sched"]')?.value || '').trim();
            const entry = { name, type: type === 'Building' ? 'Building' : 'Site' };
            if (sched) entry.transmittanceScheduleName = sched;
            siteSurfaces.push(entry);
        });

        // Zone surfaces
        const zoneSurfaces = [];
        zoneSurfacesTbody.querySelectorAll('tr').forEach((tr) => {
            if (tr.querySelector('td[colspan]')) return;
            const name = (tr.querySelector('[data-field="name"]')?.value || '').trim();
            const base = (tr.querySelector('[data-field="base"]')?.value || '').trim();
            if (!name || !base) return;
            const sched = (tr.querySelector('[data-field="sched"]')?.value || '').trim();
            const entry = { name, baseSurfaceName: base };
            if (sched) entry.transmittanceScheduleName = sched;
            zoneSurfaces.push(entry);
        });

        // Reflectance
        const reflectance = [];
        reflectanceTbody.querySelectorAll('tr').forEach((tr) => {
            if (tr.querySelector('td[colspan]')) return;
            const sName = (tr.querySelector('[data-field="name"]')?.value || '').trim();
            if (!sName) return;
            const num = (sel) => {
                const el = tr.querySelector(sel);
                if (!el) return undefined;
                const v = parseFloat(el.value);
                return Number.isFinite(v) ? clamp01(v) : undefined;
            };
            const item = {
                shadingSurfaceName: sName,
            };
            const s = num('[data-field="solar"]');
            const v = num('[data-field="vis"]');
            const ie = num('[data-field="irem"]');
            const it = num('[data-field="irtr"]');
            if (s != null) item.solarReflectance = s;
            if (v != null) item.visibleReflectance = v;
            if (ie != null) item.infraredHemisphericalEmissivity = ie;
            if (it != null) item.infraredTransmittance = it;
            reflectance.push(item);
        });

        // WindowShadingControls
        const windowShadingControls = [];
        windowControlsTbody.querySelectorAll('tr').forEach((tr) => {
            if (tr.querySelector('td[colspan]')) return;
            const name = (tr.querySelector('[data-field="name"]')?.value || '').trim();
            const shadingType = (tr.querySelector('[data-field="shadingType"]')?.value || '').trim();
            const controlType = (tr.querySelector('[data-field="controlType"]')?.value || '').trim();
            if (!name || !shadingType || !controlType) return;

            const scheduleName = (tr.querySelector('[data-field="scheduleName"]')?.value || '').trim() || undefined;
            const num = (sel) => {
                const el = tr.querySelector(sel);
                if (!el) return undefined;
                const v = parseFloat(el.value);
                return Number.isFinite(v) ? v : undefined;
            };
            const setpoint1 = num('[data-field="setpoint1"]');
            const setpoint2 = num('[data-field="setpoint2"]');
            const glareActive = tr.querySelector('[data-field="glareActive"]')?.checked || false;
            const multiType = (tr.querySelector('[data-field="multiType"]')?.value || '').trim() || undefined;
            const fenStr = (tr.querySelector('[data-field="fenestration"]')?.value || '').trim();
            const fenestrationSurfaceNames = fenStr
                ? fenStr.split(',').map((s) => s.trim()).filter(Boolean)
                : [];

            const ctrl = {
                name,
                shadingType,
                controlType,
                fenestrationSurfaceNames,
            };
            if (scheduleName) ctrl.scheduleName = scheduleName;
            if (setpoint1 != null) ctrl.setpoint1 = setpoint1;
            if (setpoint2 != null) ctrl.setpoint2 = setpoint2;
            if (glareActive) ctrl.glareControlIsActive = true;
            if (multiType) ctrl.multipleSurfaceControlType = multiType;

            if (fenestrationSurfaceNames.length) {
                windowShadingControls.push(ctrl);
            }
        });

        const shading = {};
        if (siteSurfaces.length) shading.siteSurfaces = siteSurfaces;
        if (zoneSurfaces.length) shading.zoneSurfaces = zoneSurfaces;
        if (reflectance.length) shading.reflectance = reflectance;
        if (windowShadingControls.length) shading.windowShadingControls = windowShadingControls;

        const nextEP = { ...ep };
        if (Object.keys(shading).length) {
            nextEP.shading = shading;
        } else {
            delete nextEP.shading;
        }

        if (typeof project.updateMetadata === 'function') {
            project.updateMetadata({
                ...meta,
                energyPlusConfig: nextEP,
            });
        } else {
            project.metadata = {
                ...(project.metadata || meta),
                energyPlusConfig: nextEP,
            };
        }
    }

    if (addSiteSurfaceBtn) {
        addSiteSurfaceBtn.addEventListener('click', () => addSiteSurfaceRow());
    }
    if (addZoneSurfaceBtn) {
        addZoneSurfaceBtn.addEventListener('click', () => addZoneSurfaceRow());
    }
    if (addReflectanceBtn) {
        addReflectanceBtn.addEventListener('click', () => addReflectanceRow());
    }
    if (addWinCtrlBtn) {
        addWinCtrlBtn.addEventListener('click', () => addWindowControlRow());
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            try {
                collectAndSaveShading();
                alert('Shading & Solar Control configuration saved.');
            } catch (err) {
                console.error('ShadingManager: save failed', err);
                alert('Failed to save Shading & Solar Control configuration. Check console for details.');
            }
        });
    }

    renderSiteSurfaces();
    renderZoneSurfaces();
    renderReflectance();
    renderWindowControls();

    return panel;

    function addWindowControlRow() {
        if (windowControlsTbody.children.length === 1) {
            const only = windowControlsTbody.children[0];
            if (only && only.querySelector('td[colspan]')) {
                windowControlsTbody.innerHTML = '';
            }
        }
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-1 py-1 align-top">
                <input class="w-full" data-field="name" placeholder="Control name">
            </td>
            <td class="px-1 py-1 align-top">
                <input class="w-full" data-field="windowGroup" placeholder="Window group/tag">
            </td>
            <td class="px-1 py-1 align-top">
                <select class="w-full" data-field="controlType">
                    <option value="">(select)</option>
                    <option value="AlwaysOn">AlwaysOn</option>
                    <option value="OnIfHighSolar">OnIfHighSolar</option>
                    <option value="OnIfHighGlare">OnIfHighGlare</option>
                    <option value="OnIfHighT">OnIfHighT</option>
                    <option value="OnIfHighSolarOrT">OnIfHighSolarOrT</option>
                </select>
            </td>
            <td class="px-1 py-1 align-top">
                <input class="w-full mb-0.5" data-field="device" placeholder="Shading device">
                <input class="w-full" data-field="schedule" placeholder="Schedule">
            </td>
            <td class="px-1 py-1 align-top">
                <div class="grid grid-cols-3 gap-0.5">
                    <input type="number" step="1" class="w-full" data-field="setSolar" placeholder="W/m²">
                    <input type="number" step="1" class="w-full" data-field="setLux" placeholder="lux">
                    <input type="number" step="0.1" class="w-full" data-field="setTemp" placeholder="°C">
                </div>
            </td>
            <td class="px-1 py-1 align-top">
                    <input type="number" step="0.05" min="0" max="1" class="w-full"
                    data-field="glareFrac" placeholder="0-1">
            </td>
            <td class="px-1 py-1 align-top">
                <select class="w-full" data-field="typeHint">
                    <option value="">(auto)</option>
                    <option value="Blind">Blind</option>
                    <option value="Shade">Shade</option>
                    <option value="Screen">Screen</option>
                    <option value="SwitchableGlazing">SwitchableGlazing</option>
                </select>
            </td>
            <td class="px-1 py-1 align-top text-right">
                <button class="btn btn-xxs btn-danger" data-action="delete-window-control">Delete</button>
            </td>
        `;
        windowControlsTbody.appendChild(tr);
        tr.querySelector('button[data-action="delete-window-control"]').addEventListener('click', () => {
            tr.remove();
        });
    }

    function renderOverhangs() {
        const { overhangs } = getShadingState();
        overhangsTbody.innerHTML = '';

        if (!overhangs.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-1 py-1 text-xs text-white" colspan="7">
                    No overhangs defined.
                </td>
            `;
            overhangsTbody.appendChild(tr);
            return;
        }

        overhangs.forEach((o, idx) => {
            const tr = document.createElement('tr');
            tr.dataset.index = String(idx);
            tr.innerHTML = `
                <td class="px-1 py-1 align-top">
                    <input class="w-full" data-field="name" value="${o.name || ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input class="w-full" data-field="windowGroup" value="${o.windowGroup || ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input type="number" step="0.01" class="w-full" data-field="depth" value="${o.depth ?? ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input type="number" step="0.01" class="w-full" data-field="vOffset" value="${o.verticalOffset ?? ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input type="number" step="0.01" class="w-full" data-field="leftExt" value="${o.leftExt ?? ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input type="number" step="0.01" class="w-full" data-field="rightExt" value="${o.rightExt ?? ''}">
                </td>
                <td class="px-1 py-1 align-top text-right">
                    <button class="btn btn-xxs btn-danger" data-action="delete-overhang">Delete</button>
                </td>
            `;
            overhangsTbody.appendChild(tr);
        });

        overhangsTbody
            .querySelectorAll('button[data-action="delete-overhang"]')
            .forEach((btn) => {
                btn.addEventListener('click', () => {
                    const row = btn.closest('tr');
                    if (row) row.remove();
                });
            });
    }

    function addOverhangRow() {
        if (overhangsTbody.children.length === 1) {
            const only = overhangsTbody.children[0];
            if (only && only.querySelector('td[colspan]')) {
                overhangsTbody.innerHTML = '';
            }
        }
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-1 py-1 align-top">
                <input class="w-full" data-field="name" placeholder="Overhang name">
            </td>
            <td class="px-1 py-1 align-top">
                <input class="w-full" data-field="windowGroup" placeholder="Window group/tag">
            </td>
            <td class="px-1 py-1 align-top">
                <input type="number" step="0.01" class="w-full" data-field="depth" placeholder="Depth">
            </td>
            <td class="px-1 py-1 align-top">
                <input type="number" step="0.01" class="w-full" data-field="vOffset" placeholder="Offset">
            </td>
            <td class="px-1 py-1 align-top">
                <input type="number" step="0.01" class="w-full" data-field="leftExt" placeholder="Left">
            </td>
            <td class="px-1 py-1 align-top">
                <input type="number" step="0.01" class="w-full" data-field="rightExt" placeholder="Right">
            </td>
            <td class="px-1 py-1 align-top text-right">
                <button class="btn btn-xxs btn-danger" data-action="delete-overhang">Delete</button>
            </td>
        `;
        overhangsTbody.appendChild(tr);
        tr.querySelector('button[data-action="delete-overhang"]').addEventListener('click', () => {
            tr.remove();
        });
    }

    function collectAndSaveShading() {
        const { meta, ep } = getShadingState();

        // Collect surfaces
        const surfaces = [];
        surfacesTbody.querySelectorAll('tr').forEach((tr) => {
            const hasPlaceholder = tr.querySelector('td[colspan]');
            if (hasPlaceholder) return;

            const targetName = (tr.querySelector('[data-field="targetName"]')?.value || '').trim();
            if (!targetName) return;

            const targetType =
                tr.querySelector('[data-field="targetType"]')?.value || 'Surface';

            const num = (field) => {
                const el = tr.querySelector(`[data-field="${field}"]`);
                if (!el) return undefined;
                const v = parseFloat(el.value);
                return Number.isFinite(v) ? v : undefined;
            };

            const sw = clamp01(num('swRefl'));
            const vis = clamp01(num('visRefl'));
            const lw = clamp01(num('lwEmiss'));

            if (sw == null && vis == null && lw == null) {
                return;
            }

            const entry = {
                targetType,
                targetName,
            };
            if (sw != null) entry.shortWaveReflectance = sw;
            if (vis != null) entry.visibleReflectance = vis;
            if (lw != null) entry.longWaveEmissivity = lw;
            surfaces.push(entry);
        });

        // Collect window controls
        const windowControls = [];
        windowControlsTbody.querySelectorAll('tr').forEach((tr) => {
            const hasPlaceholder = tr.querySelector('td[colspan]');
            if (hasPlaceholder) return;

            const name = (tr.querySelector('[data-field="name"]')?.value || '').trim();
            const windowGroup =
                (tr.querySelector('[data-field="windowGroup"]')?.value || '').trim();
            const controlType =
                (tr.querySelector('[data-field="controlType"]')?.value || '').trim();

            if (!name || !windowGroup || !controlType) {
                return;
            }

            const device =
                (tr.querySelector('[data-field="device"]')?.value || '').trim() || undefined;
            const schedule =
                (tr.querySelector('[data-field="schedule"]')?.value || '').trim() ||
                undefined;

            const num = (field) => {
                const el = tr.querySelector(`[data-field="${field}"]`);
                if (!el) return undefined;
                const v = parseFloat(el.value);
                return Number.isFinite(v) ? v : undefined;
            };

            const solar = num('setSolar');
            const lux = num('setLux');
            const temp = num('setTemp');
            let glare = num('glareFrac');
            if (glare != null) glare = clamp01(glare);

            const typeHint =
                (tr.querySelector('[data-field="typeHint"]')?.value || '').trim() || undefined;

            const entry = {
                name,
                windowGroup,
                controlType,
            };
            if (device) entry.shadingDeviceName = device;
            if (schedule) entry.scheduleName = schedule;
            if (solar != null) entry.setpointSolar = solar;
            if (lux != null) entry.setpointIlluminance = lux;
            if (temp != null) entry.setpointTemp = temp;
            if (glare != null) entry.glareProtectionFraction = glare;
            if (typeHint) entry.typeHint = typeHint;

            windowControls.push(entry);
        });

        // Collect overhangs
        const overhangs = [];
        overhangsTbody.querySelectorAll('tr').forEach((tr) => {
            const hasPlaceholder = tr.querySelector('td[colspan]');
            if (hasPlaceholder) return;

            const name = (tr.querySelector('[data-field="name"]')?.value || '').trim();
            const windowGroup =
                (tr.querySelector('[data-field="windowGroup"]')?.value || '').trim();

            const num = (field) => {
                const el = tr.querySelector(`[data-field="${field}"]`);
                if (!el) return NaN;
                const v = parseFloat(el.value);
                return v;
            };

            const depth = num('depth');
            const vOffset = num('vOffset');
            const leftExt = num('leftExt');
            const rightExt = num('rightExt');

            if (!name || !windowGroup || !Number.isFinite(depth) || !Number.isFinite(vOffset)) {
                return;
            }

            const entry = {
                name,
                windowGroup,
                depth,
                verticalOffset: vOffset,
            };
            if (Number.isFinite(leftExt)) entry.leftExt = leftExt;
            if (Number.isFinite(rightExt)) entry.rightExt = rightExt;

            overhangs.push(entry);
        });

        const shading = {};
        if (surfaces.length) shading.surfaces = surfaces;
        if (windowControls.length) shading.windowControls = windowControls;
        if (overhangs.length) shading.overhangs = overhangs;

        const nextEP = {
            ...ep,
        };
        if (Object.keys(shading).length) {
            nextEP.shading = shading;
        } else {
            // Leave shading undefined/removed if all sections empty
            if (nextEP.shading) {
                delete nextEP.shading;
            }
        }

        if (typeof project.updateMetadata === 'function') {
            project.updateMetadata({
                ...meta,
                energyPlusConfig: nextEP,
            });
        } else {
            project.metadata = {
                ...(project.metadata || meta),
                energyPlusConfig: nextEP,
            };
        }
    }

    if (addSurfaceBtn) {
        addSurfaceBtn.addEventListener('click', () => {
            addSurfaceRow();
        });
    }
    if (addWinCtrlBtn) {
        addWinCtrlBtn.addEventListener('click', () => {
            addWindowControlRow();
        });
    }
    if (addOverhangBtn) {
        addOverhangBtn.addEventListener('click', () => {
            addOverhangRow();
        });
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            try {
                collectAndSaveShading();
                alert('Shading & Solar Control configuration saved.');
            } catch (err) {
                console.error('ShadingManager: save failed', err);
                alert('Failed to save Shading & Solar Control configuration. Check console for details.');
            }
        });
    }

    // Initial render from existing config (if any)
    renderSurfaces();
    renderWindowControls();
    renderOverhangs();

    return panel;
}

function createDaylightingManagerPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-energyplus-daylighting';
    panel.className = 'floating-window ui-panel resizable-panel';

    panel.innerHTML = `
        <div class="window-header">
            <span>Daylighting & Lighting Outputs</span>
            <!-- Help button removed -->
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
                Configure per-zone <code>Daylighting:Controls</code>, <code>Output:IlluminanceMap</code>,
                and selected <code>Output:Variable</code> entries.
                Settings are stored in <code>energyPlusConfig.daylighting</code> and consumed by the EnergyPlus model builder.
                If left empty, Ray-Modeler emits no additional daylighting controls/maps beyond defaults.
            </p>

            <!-- Per-zone Daylighting:Controls -->
            <div class="space-y-1">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">Daylighting Controls (per zone)</span>
                </div>
                <div class="border border-gray-700/70 rounded bg-black/40 max-h-60 overflow-y-auto **scrollable-panel-inner**">
                    <table class="w-full text-xs">
                        <thead class="bg-black/40">
                            <tr>
                                <th class="px-1 py-1 text-left">Zone</th>
                                <th class="px-1 py-1 text-left">Enabled</th>
                                <th class="px-1 py-1 text-left">Ref Pt 1 (x,y,z)</th>
                                <th class="px-1 py-1 text-left">Ref Pt 2 (x,y,z)</th>
                                <th class="px-1 py-1 text-left">Setpoint [lux]</th>
                                <th class="px-1 py-1 text-left">Type</th>
                                <th class="px-1 py-1 text-left">Fraction</th>
                            </tr>
                        </thead>
                        <tbody class="daylighting-controls-tbody"></tbody>
                    </table>
                </div>
            </div>

            <!-- Illuminance Maps -->
            <div class="space-y-1">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">Illuminance Maps</span>
                    <button class="btn btn-xxs btn-secondary" data-action="add-illum-map">+ Add Map</button>
                </div>
                <div class="border border-gray-700/70 rounded bg-black/40 max-h-40 overflow-y-auto **scrollable-panel-inner**">
                    <table class="w-full text-xs">
                        <thead class="bg-black/40">
                            <tr>
                                <th class="px-1 py-1 text-left">Name</th>
                                <th class="px-1 py-1 text-left">Zone</th>
                                <th class="px-1 py-1 text-left">Origin (x,y,z)</th>
                                <th class="px-1 py-1 text-left">Grid (Nx, Dx, Ny, Dy)</th>
                                <th class="px-1 py-1 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="illum-maps-tbody"></tbody>
                    </table>
                </div>
            </div>

            <!-- Output:Variable (lighting/daylighting focused) -->
            <div class="space-y-1">
                <div class="flex justify-between items-center">
                    <span class="font-semibold text-xs uppercase text-[--text-secondary]">Lighting & Daylighting Output Variables</span>
                    <button class="btn btn-xxs btn-secondary" data-action="add-output-var">+ Add Variable</button>
                </div>
                <div class="border border-gray-700/70 rounded bg-black/40 max-h-40 overflow-y-auto scrollable-panel-inner">
                    <table class="w-full text-xs">
                        <thead class="bg-black/40">
                            <tr>
                                <th class="px-1 py-1 text-left">Key</th>
                                <th class="px-1 py-1 text-left">Variable Name</th>
                                <th class="px-1 py-1 text-left">Frequency</th>
                                <th class="px-1 py-1 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="daylighting-output-vars-tbody"></tbody>
                    </table>
                </div>
                <p class="text-xs text-[--text-secondary]">
                    Examples: Key = zone name or "Environment"; Variable = "Zone Lights Electric Power";
                    Frequency = Hourly / Timestep / RunPeriod, etc.
                    These entries are stored in <code>energyPlusConfig.daylighting.outputs.variables</code>.
                </p>
            </div>

            <div class="flex justify-end gap-2">
                <button class="btn btn-xxs btn-secondary" data-action="save-daylighting">Save Daylighting & Outputs</button>
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

    const controlsTbody = panel.querySelector('.daylighting-controls-tbody');
    const illumTbody = panel.querySelector('.illum-maps-tbody');
    const outputVarsTbody = panel.querySelector('.daylighting-output-vars-tbody');
    const addIllumBtn = panel.querySelector('[data-action="add-illum-map"]');
    const addOutputVarBtn = panel.querySelector('[data-action="add-output-var"]');
    const saveBtn = panel.querySelector('[data-action="save-daylighting"]');

    const headerHelp = panel.querySelector('[data-action="open-help-daylighting"]');
    if (headerHelp) {
        headerHelp.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            console.debug('[EnergyPlus] Daylighting help disabled');
        });
    }

    function getMetaEPDaylighting() {
        const meta =
            (typeof project.getMetadata === 'function' && project.getMetadata()) ||
            project.metadata ||
            {};
        const ep = meta.energyPlusConfig || meta.energyplus || {};
        const daylighting = ep.daylighting || {};
        return { meta, ep, daylighting };
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

    function renderControls() {
        const { daylighting } = getMetaEPDaylighting();
        const zones = getZones();
        const existing = new Map();

        if (Array.isArray(daylighting.controls)) {
            daylighting.controls.forEach((c) => {
                if (c && c.zoneName) {
                    existing.set(String(c.zoneName), c);
                }
            });
        }

        controlsTbody.innerHTML = '';

        zones.forEach((z) => {
            const zn = String(z.name);
            const c = existing.get(zn) || {};
            const enabled = c.enabled !== false && c.refPoints && c.refPoints.length > 0 && typeof c.setpoint === 'number';

            const rp1 = (c.refPoints && c.refPoints[0]) || {};
            const rp2 = (c.refPoints && c.refPoints[1]) || {};

            const tr = document.createElement('tr');
            tr.dataset.zoneName = zn;
            tr.innerHTML = `
                <td class="px-1 py-1 align-top text-[--accent-color]">${zn}</td>
                <td class="px-1 py-1 align-top">
                    <input type="checkbox" data-field="enabled" ${enabled ? 'checked' : ''}>
                </td>
                <td class="px-1 py-1 align-top">
                    <div class="grid grid-cols-3 gap-0.5">
                        <input type="number" step="0.01" class="w-full text-xs" placeholder="x" data-field="rp1x" value="${rp1.x ?? ''}">
                        <input type="number" step="0.01" class="w-full text-xs" placeholder="y" data-field="rp1y" value="${rp1.y ?? ''}">
                        <input type="number" step="0.01" class="w-full text-xs" placeholder="z" data-field="rp1z" value="${rp1.z ?? ''}">
                    </div>
                </td>
                <td class="px-1 py-1 align-top">
                    <div class="grid grid-cols-3 gap-0.5">
                        <input type="number" step="0.01" class="w-full text-xs" placeholder="x" data-field="rp2x" value="${rp2.x ?? ''}">
                        <input type="number" step="0.01" class="w-full text-xs" placeholder="y" data-field="rp2y" value="${rp2.y ?? ''}">
                        <input type="number" step="0.01" class="w-full text-xs" placeholder="z" data-field="rp2z" value="${rp2.z ?? ''}">
                    </div>
                </td>
                <td class="px-1 py-1 align-top">
                    <input type="number" step="1" class="w-full text-xs" data-field="setpoint" value="${c.setpoint ?? ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <select class="w-full text-xs" data-field="type">
                        <option value="Continuous"${c.type === 'Continuous' || !c.type ? ' selected' : ''}>Continuous</option>
                        <option value="Stepped"${c.type === 'Stepped' ? ' selected' : ''}>Stepped</option>
                        <option value="ContinuousOff"${c.type === 'ContinuousOff' ? ' selected' : ''}>ContinuousOff</option>
                    </select>
                </td>
                <td class="px-1 py-1 align-top">
                    <input type="number" step="0.05" min="0" max="1" class="w-full text-xs" data-field="fraction" value="${c.fraction ?? ''}">
                </td>
            `;
            controlsTbody.appendChild(tr);
        });
    }

    function renderIlluminanceMaps() {
        const { daylighting } = getMetaEPDaylighting();
        const zones = getZones().map((z) => z.name);
        const maps = (daylighting.outputs && Array.isArray(daylighting.outputs.illuminanceMaps))
            ? daylighting.outputs.illuminanceMaps
            : [];

        illumTbody.innerHTML = '';

        if (!maps.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-1 py-1 text-xs text-white" colspan="5">
                    No illuminance maps defined.
                </td>
            `;
            illumTbody.appendChild(tr);
            return;
        }

        maps.forEach((m, index) => {
            const tr = document.createElement('tr');
            tr.dataset.index = String(index);
            tr.innerHTML = `
                <td class="px-1 py-1 align-top">
                    <input class="w-full text-xs" data-field="name" value="${m.name || ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <select class="w-full text-xs" data-field="zoneName">
                        ${zones
                    .map((zn) => `<option value="${zn}"${zn === m.zoneName ? ' selected' : ''}>${zn}</option>`)
                    .join('')}
                    </select>
                </td>
                <td class="px-1 py-1 align-top">
                    <div class="grid grid-cols-3 gap-0.5">
                        <input type="number" step="0.01" class="w-full text-xs" placeholder="x" data-field="xOrigin" value="${m.xOrigin ?? ''}">
                        <input type="number" step="0.01" class="w-full text-xs" placeholder="y" data-field="yOrigin" value="${m.yOrigin ?? ''}">
                        <input type="number" step="0.01" class="w-full text-xs" placeholder="z" data-field="zHeight" value="${m.zHeight ?? ''}">
                    </div>
                </td>
                <td class="px-1 py-1 align-top">
                    <div class="grid grid-cols-4 gap-0.5">
                        <input type="number" step="1" class="w-full text-xs" placeholder="Nx" data-field="xNumPoints" value="${m.xNumPoints ?? ''}">
                        <input type="number" step="0.01" class="w-full text-xs" placeholder="Dx" data-field="xSpacing" value="${m.xSpacing ?? ''}">
                        <input type="number" step="1" class="w-full text-xs" placeholder="Ny" data-field="yNumPoints" value="${m.yNumPoints ?? ''}">
                        <input type="number" step="0.01" class="w-full text-xs" placeholder="Dy" data-field="ySpacing" value="${m.ySpacing ?? ''}">
                    </div>
                </td>
                <td class="px-1 py-1 align-top text-right">
                    <button class="btn btn-xxs btn-danger" data-action="delete-map">Delete</button>
                </td>
            `;
            illumTbody.appendChild(tr);
        });

        illumTbody.querySelectorAll('button[data-action="delete-map"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('tr');
                if (row) row.remove();
            });
        });
    }

    function addIlluminanceMapRow() {
        const zones = getZones().map((z) => z.name);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-1 py-1 align-top">
                <input class="w-full text-xs" data-field="name" placeholder="Map name">
            </td>
            <td class="px-1 py-1 align-top">
                <select class="w-full text-xs" data-field="zoneName">
                    ${zones.map((zn) => `<option value="${zn}">${zn}</option>`).join('')}
                </select>
            </td>
            <td class="px-1 py-1 align-top">
                <div class="grid grid-cols-3 gap-0.5">
                    <input type="number" step="0.01" class="w-full text-xs" placeholder="x" data-field="xOrigin">
                    <input type="number" step="0.01" class="w-full text-xs" placeholder="y" data-field="yOrigin">
                    <input type="number" step="0.01" class="w-full text-xs" placeholder="z" data-field="zHeight">
                </div>
            </td>
            <td class="px-1 py-1 align-top">
                <div class="grid grid-cols-4 gap-0.5">
                    <input type="number" step="1" class="w-full text-xs" placeholder="Nx" data-field="xNumPoints">
                    <input type="number" step="0.01" class="w-full text-xs" placeholder="Dx" data-field="xSpacing">
                    <input type="number" step="1" class="w-full text-xs" placeholder="Ny" data-field="yNumPoints">
                    <input type="number" step="0.01" class="w-full text-xs" placeholder="Dy" data-field="ySpacing">
                </div>
            </td>
            <td class="px-1 py-1 align-top text-right">
                <button class="btn btn-xxs btn-danger" data-action="delete-map">Delete</button>
            </td>
        `;
        illumTbody.appendChild(tr);
        const delBtn = tr.querySelector('button[data-action="delete-map"]');
        if (delBtn) {
            delBtn.addEventListener('click', () => tr.remove());
        }
    }

    function renderOutputVariables() {
        const { daylighting } = getMetaEPDaylighting();
        const outputs = daylighting.outputs || {};
        const vars = Array.isArray(outputs.variables) ? outputs.variables : [];
        outputVarsTbody.innerHTML = '';

        if (!vars.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-1 py-1 text-xs text-white" colspan="4">
                    No Output:Variable entries defined for daylighting/lighting.
                </td>
            `;
            outputVarsTbody.appendChild(tr);
            return;
        }

        vars.forEach((v, idx) => {
            const tr = document.createElement('tr');
            tr.dataset.index = String(idx);
            tr.innerHTML = `
                <td class="px-1 py-1 align-top">
                    <input class="w-full text-xs" data-field="key" value="${v.key || ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input class="w-full text-xs" data-field="variableName" value="${v.variableName || ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <select class="w-full text-xs" data-field="freq">
                        ${['Timestep', 'Hourly', 'Daily', 'Monthly', 'RunPeriod'].map((f) => `
                            <option value="${f}"${(v.reportingFrequency || 'Hourly') === f ? ' selected' : ''}>${f}</option>
                        `).join('')}
                    </select>
                </td>
                <td class="px-1 py-1 align-top text-right">
                    <button class="btn btn-xxs btn-danger" data-action="delete-var">Delete</button>
                </td>
            `;
            outputVarsTbody.appendChild(tr);
        });

        outputVarsTbody.querySelectorAll('button[data-action="delete-var"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('tr');
                if (row) row.remove();
            });
        });
    }

    function addOutputVarRow() {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-1 py-1 align-top">
                <input class="w-full text-xs" data-field="key" placeholder="Key (zone name, Environment, *)">
            </td>
            <td class="px-1 py-1 align-top">
                <input class="w-full text-xs" data-field="variableName" placeholder="Variable Name">
            </td>
            <td class="px-1 py-1 align-top">
                <select class="w-full text-xs" data-field="freq">
                    <option value="Hourly" selected>Hourly</option>
                    <option value="Timestep">Timestep</option>
                    <option value="Daily">Daily</option>
                    <option value="Monthly">Monthly</option>
                    <option value="RunPeriod">RunPeriod</option>
                </select>
            </td>
            <td class="px-1 py-1 align-top text-right">
                <button class="btn btn-xxs btn-danger" data-action="delete-var">Delete</button>
            </td>
        `;
        outputVarsTbody.appendChild(tr);
        tr.querySelector('[data-action="delete-var"]').addEventListener('click', () => {
            tr.remove();
        });
    }

    function collectDaylightingFromUI() {
        const { meta, ep } = getMetaEPDaylighting();
        const zones = getZones().map((z) => z.name);
        const zoneSet = new Set(zones);

        // Controls
        const controls = [];
        controlsTbody.querySelectorAll('tr[data-zone-name]').forEach((tr) => {
            const zn = tr.dataset.zoneName;
            if (!zn || !zoneSet.has(zn)) return;

            const enabled = tr.querySelector('[data-field="enabled"]')?.checked;
            const num = (field) => {
                const el = tr.querySelector(`[data-field="${field}"]`);
                if (!el) return undefined;
                const v = parseFloat(el.value);
                return Number.isFinite(v) ? v : undefined;
            };

            const setpoint = num('setpoint');
            const rp1 = {
                x: num('rp1x'),
                y: num('rp1y'),
                z: num('rp1z'),
            };
            const rp2 = {
                x: num('rp2x'),
                y: num('rp2y'),
                z: num('rp2z'),
            };
            const type = tr.querySelector('[data-field="type"]')?.value || 'Continuous';
            const fractionEl = tr.querySelector('[data-field="fraction"]');
            const fractionVal = fractionEl ? parseFloat(fractionEl.value) : NaN;
            const fraction =
                Number.isFinite(fractionVal) && fractionVal > 0
                    ? Math.max(0, Math.min(1, fractionVal))
                    : undefined;

            const hasRP1 = Number.isFinite(rp1.x) && Number.isFinite(rp1.y) && Number.isFinite(rp1.z);
            const hasRP2 = Number.isFinite(rp2.x) && Number.isFinite(rp2.y) && Number.isFinite(rp2.z);

            if (enabled && hasRP1 && Number.isFinite(setpoint)) {
                const refPoints = [];
                refPoints.push({ x: rp1.x, y: rp1.y, z: rp1.z });
                if (hasRP2) {
                    refPoints.push({ x: rp2.x, y: rp2.y, z: rp2.z });
                }
                const ctrl = {
                    zoneName: zn,
                    enabled: true,
                    refPoints,
                    setpoint,
                    type: type === 'Stepped' || type === 'ContinuousOff' ? type : 'Continuous',
                };
                if (fraction !== undefined) {
                    ctrl.fraction = fraction;
                }
                controls.push(ctrl);
            }
        });

        // Illuminance maps
        const illuminanceMaps = [];
        illumTbody.querySelectorAll('tr').forEach((tr) => {
            const nameEl = tr.querySelector('[data-field="name"]');
            if (!nameEl) return;
            const name = (nameEl.value || '').trim();
            if (!name) return;

            const zoneName = (tr.querySelector('[data-field="zoneName"]')?.value || '').trim();
            if (!zoneName || !zoneSet.has(zoneName)) return;

            const num = (field) => {
                const el = tr.querySelector(`[data-field="${field}"]`);
                if (!el) return NaN;
                const v = parseFloat(el.value);
                return v;
            };

            const xOrigin = num('xOrigin');
            const yOrigin = num('yOrigin');
            const zHeight = num('zHeight');
            const xNumPoints = num('xNumPoints');
            const xSpacing = num('xSpacing');
            const yNumPoints = num('yNumPoints');
            const ySpacing = num('ySpacing');

            if (
                !Number.isFinite(xOrigin) ||
                !Number.isFinite(yOrigin) ||
                !Number.isFinite(zHeight) ||
                !Number.isFinite(xNumPoints) ||
                !Number.isFinite(xSpacing) ||
                !Number.isFinite(yNumPoints) ||
                !Number.isFinite(ySpacing)
            ) {
                return;
            }

            illuminanceMaps.push({
                name,
                zoneName,
                xOrigin,
                yOrigin,
                zHeight,
                xNumPoints,
                xSpacing,
                yNumPoints,
                ySpacing,
            });
        });

        // Output:Variable (lighting/daylighting)
        const vars = [];
        outputVarsTbody.querySelectorAll('tr').forEach((tr) => {
            const key = (tr.querySelector('[data-field="key"]')?.value || '').trim();
            const variableName = (tr.querySelector('[data-field="variableName"]')?.value || '').trim();
            const freq = (tr.querySelector('[data-field="freq"]')?.value || '').trim() || 'Hourly';
            if (!key || !variableName) return;
            vars.push({
                key,
                variableName,
                reportingFrequency: freq,
            });
        });

        const nextDaylighting = {};
        if (controls.length) {
            nextDaylighting.controls = controls;
        }
        if (illuminanceMaps.length || vars.length) {
            nextDaylighting.outputs = {};
            if (illuminanceMaps.length) {
                nextDaylighting.outputs.illuminanceMaps = illuminanceMaps;
            }
            if (vars.length) {
                nextDaylighting.outputs.variables = vars;
            }
        }

        const nextEP = {
            ...ep,
            daylighting: nextDaylighting,
        };

        return { meta, nextEP };
    }

    if (addIllumBtn) {
        addIllumBtn.addEventListener('click', () => {
            addIlluminanceMapRow();
        });
    }

    if (addOutputVarBtn) {
        addOutputVarBtn.addEventListener('click', () => {
            addOutputVarRow();
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            try {
                const { meta, nextEP } = collectDaylightingFromUI();
                if (typeof project.updateMetadata === 'function') {
                    project.updateMetadata({
                        ...meta,
                        energyPlusConfig: nextEP,
                    });
                } else {
                    project.metadata = {
                        ...(project.metadata || meta),
                        energyPlusConfig: nextEP,
                    };
                }
                alert('Daylighting & Outputs configuration saved.');
            } catch (err) {
                console.error('DaylightingManager: save failed', err);
                alert('Failed to save Daylighting configuration. Check console for details.');
            }
        });
    }

    // Initial render using existing config (supports legacy energyPlusConfig.daylighting)
    renderControls();
    renderIlluminanceMaps();
    renderOutputVariables();

    return panel;
}

/**
 * OUTPUTS MANAGER
 * Manage energyPlusConfig.daylighting.outputs.variables (Output:Variable entries).
 */
function openOutputsManagerPanel() {
    const panelId = 'panel-energyplus-outputs';
    let panel = document.getElementById(panelId);
    if (!panel) {
        panel = createOutputsManagerPanel();
        document.getElementById('window-container').appendChild(panel);
    }
    panel.classList.remove('hidden');
    panel.style.zIndex = getNewZIndex();
}

function createOutputsManagerPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-energyplus-outputs';
    panel.className = 'floating-window ui-panel resizable-panel';

    panel.innerHTML = `
        <div class="window-header">
            <span>Outputs</span>
            <div class="window-controls">
                <div class="window-icon-max" title="Maximize/Restore"></div>
                <div class="collapse-icon" title="Minimize"></div>
                <div class="window-icon-close" title="Close"></div>
            </div>
        </div>
        <div class="window-content space-y-2">
            <div class="resize-handle-edge top"></div>
            <div class="resize-handle-edge right"></div>
            <div class="resize-handle-edge bottom"></div>
            <div class="resize-handle-edge left"></div>
            <div class="resize-handle-corner top-left"></div>
            <div class="resize-handle-corner top-right"></div>
            <div class="resize-handle-corner bottom-left"></div>
            <div class="resize-handle-corner bottom-right"></div>

            <p class="info-box !text-xs !py-1.5 !px-2">
            <p class="info-box !text-xs !py-1.5 !px-2">
                Configure <code>Output:Variable</code> entries.
                Settings are stored in <code>energyPlusConfig.daylighting.outputs.variables</code>.
            </p>

            <div class="flex justify-between items-center">
                <span class="font-semibold text-xs uppercase text-[--text-secondary]">Output Variables</span>
                <button class="btn btn-xxs btn-secondary" data-action="add-output-var">+ Add Variable</button>
            </div>

            <div class="border border-gray-700/70 rounded bg-black/40 max-h-56 overflow-y-auto **scrollable-panel-inner**">
                <table class="w-full text-xs">
                    <thead class="bg-black/40">
                        <tr>
                            <th class="px-1 py-1 text-left">Key</th>
                            <th class="px-1 py-1 text-left">Variable Name</th>
                            <th class="px-1 py-1 text-left">Frequency</th>
                            <th class="px-1 py-1 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="outputs-vars-tbody"></tbody>
                </table>
            </div>

            <div class="text-xs text-[--text-secondary]">
                Examples: Key = zone name or "Environment"; Variable = "Zone Lights Electric Power"; Frequency = Hourly/RunPeriod/etc.
            </div>

            <div class="flex justify-end gap-2">
                <button class="btn btn-xxs btn-secondary" data-action="save-outputs">Save Outputs</button>
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

    const tbody = panel.querySelector('.outputs-vars-tbody');
    const addBtn = panel.querySelector('[data-action="add-output-var"]');
    const saveBtn = panel.querySelector('[data-action="save-outputs"]');

    function getState() {
        const meta =
            (typeof project.getMetadata === 'function' && project.getMetadata()) ||
            project.metadata ||
            {};
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
                <td class="px-1 py-1 text-xs text-white" colspan="4">
                    No Output:Variable entries defined.
                </td>
            `;
            tbody.appendChild(tr);
            return;
        }

        vars.forEach((v, index) => {
            const tr = document.createElement('tr');
            tr.dataset.index = String(index);
            tr.innerHTML = `
                <td class="px-1 py-1 align-top">
                    <input class="w-full text-xs" data-field="key" value="${v.key || ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <input class="w-full text-xs" data-field="variableName" value="${v.variableName || ''}">
                </td>
                <td class="px-1 py-1 align-top">
                    <select class="w-full text-xs" data-field="freq">
                        ${['Timestep', 'Hourly', 'Daily', 'Monthly', 'RunPeriod'].map((f) => `
                            <option value="${f}"${(v.reportingFrequency || 'Hourly') === f ? ' selected' : ''}>${f}</option>
                        `).join('')}
                    </select>
                </td>
                <td class="px-1 py-1 align-top text-right">
                    <button class="btn btn-xxs btn-danger" data-action="delete-var">Delete</button>
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
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-1 py-1 align-top">
                <input class="w-full text-xs" data-field="key" placeholder="Key (zone name, Environment, *)">
            </td>
            <td class="px-1 py-1 align-top">
                <input class="w-full text-xs" data-field="variableName" placeholder="Variable Name">
            </td>
            <td class="px-1 py-1 align-top">
                <select class="w-full text-xs" data-field="freq">
                    <option value="Hourly" selected>Hourly</option>
                    <option value="Timestep">Timestep</option>
                    <option value="Daily">Daily</option>
                    <option value="Monthly">Monthly</option>
                    <option value="RunPeriod">RunPeriod</option>
                </select>
            </td>
            <td class="px-1 py-1 align-top text-right">
                <button class="btn btn-xxs btn-danger" data-action="delete-var">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
        tr.querySelector('[data-action="delete-var"]').addEventListener('click', () => {
            tr.remove();
        });
    }

    function collect() {
        const { meta, ep, daylighting } = getState();
        const vars = [];
        tbody.querySelectorAll('tr').forEach((tr) => {
            const key = (tr.querySelector('[data-field="key"]')?.value || '').trim();
            const variableName = (tr.querySelector('[data-field="variableName"]')?.value || '').trim();
            const freq = tr.querySelector('[data-field="freq"]')?.value || 'Hourly';
            if (!key || !variableName) return;
            vars.push({
                key,
                variableName,
                reportingFrequency: freq,
            });
        });

        const nextDaylighting = {
            ...daylighting,
            outputs: {
                ...(daylighting.outputs || {}),
                variables: vars,
            },
        };

        const nextEP = {
            ...ep,
            daylighting: nextDaylighting,
        };

        return { meta, nextEP };
    }

    if (addBtn) {
        addBtn.addEventListener('click', () => addRow());
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            try {
                const { meta, nextEP } = collect();
                if (typeof project.updateMetadata === 'function') {
                    project.updateMetadata({
                        ...meta,
                        energyPlusConfig: nextEP,
                    });
                } else {
                    project.metadata = {
                        ...(project.metadata || meta),
                        energyPlusConfig: nextEP,
                    };
                }
                alert('Outputs configuration saved.');
            } catch (err) {
                console.error('OutputsManager: save failed', err);
                alert('Failed to save Outputs configuration. Check console for details.');
            }
        });
    }

    render();

    return panel;
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
    openDaylightingManagerPanel,
    openOutputsManagerPanel,
    openOutdoorAirManagerPanel,
    openShadingManagerPanel
};
