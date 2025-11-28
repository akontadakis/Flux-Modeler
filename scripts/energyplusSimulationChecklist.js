
import { getDom } from './dom.js';
import { project } from './project.js';
import {
    openDiagnosticsPanel,
    openMaterialsManagerPanel,
    openConstructionsManagerPanel,
    openSchedulesManagerPanel,
    openZoneLoadsManagerPanel,
    openThermostatsPanel,
    openOutputsManagerPanel,
    openRecipePanel,
    recipes
} from './energyplusSidebar.js';
import { openDaylightingManagerPanel } from './energyplusDaylighting.js';
import { openProjectSetupPanel } from './energyplusProjectSetup.js';
import { initializePanelControls } from './ui.js';

let dom;

/**
 * Opens the Simulation Checklist Panel.
 */
export function openSimulationChecklistPanel() {
    dom = getDom();
    const panelId = 'panel-checklist'; // Reusing the existing ID
    const btnId = 'toggle-panel-checklist-btn';
    const btn = document.getElementById(btnId);

    let panel = document.getElementById(panelId);

    // If panel exists and is visible, toggle it closed
    if (panel && !panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
        if (btn) btn.classList.remove('active');
        return;
    }

    // If panel exists but might be old/broken, remove it to force recreation
    if (panel) {
        // Check if it has the correct structure
        if (!panel.querySelector('#checklist-list') || !panel.classList.contains('floating-window')) {
            panel.remove();
            panel = null;
        }
    }

    // Create and append if needed
    if (!panel) {
        panel = createSimulationChecklistPanel();
        const container = document.getElementById('window-container');
        container.appendChild(panel);

        // Initialize controls AFTER adding to DOM to ensure styles are computed correctly
        if (typeof initializePanelControls === 'function') {
            initializePanelControls(panel);
        }
    }

    panel.classList.remove('hidden');
    if (btn) btn.classList.add('active');

    // Bring to front
    const allPanels = document.querySelectorAll('.floating-window');
    let maxZ = 100;
    allPanels.forEach(p => {
        const z = parseInt(window.getComputedStyle(p).zIndex) || 0;
        if (z > maxZ) maxZ = z;
    });
    panel.style.zIndex = maxZ + 1;

    // Default view: Select first step if not set
    if (!panel.dataset.currentStep) {
        panel.dataset.currentStep = 'geometry';
    }

    renderSidebarList(panel);
}

function getPanelHTML() {
    return `
        <div class="window-header">
            <span>Simulation Checklist</span>
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
                <!-- Left Sidebar: List -->
                <div style="width: 200px; border-right: 1px solid var(--grid-color); display: flex; flex-direction: column;">
                    <div style="padding: 0.5rem 0.75rem; margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                        <span class="label" style="font-size: 0.75rem; color: var(--text-secondary);">Workflow Steps</span>
                        <button class="btn btn-xs btn-secondary" id="checklist-refresh-btn" title="Refresh Checklist">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                        </button>
                    </div>
                    <div id="checklist-list" class="scrollable-panel-inner" style="flex: 1; overflow-y: auto;">
                        <!-- List items injected here -->
                        <div class="p-4 text-xs text-[--text-secondary]">Loading...</div>
                    </div>
                </div>

                <!-- Right Content: Details -->
                <div id="checklist-detail" style="flex: 1; padding: 1.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
                    <div class="text-[--text-secondary] text-sm text-center mt-10">Select a step to view details.</div>
                </div>
            </div>
        </div>
    `;
}

function createSimulationChecklistPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-checklist';
    panel.className = 'floating-window ui-panel resizable-panel';
    panel.style.width = '600px';
    panel.style.height = '500px';

    panel.innerHTML = getPanelHTML();

    const refreshBtn = panel.querySelector('#checklist-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            renderSidebarList(panel);
        });
    }

    return panel;
}

// Note: initializePanelControls is now called in openSimulationChecklistPanel
// after the panel is added to the DOM.

async function renderSidebarList(panel) {
    const listContainer = panel.querySelector('#checklist-list');

    // Show loading state if empty
    if (!listContainer.querySelector('.checklist-item')) {
        listContainer.innerHTML = '<div class="p-4 text-xs text-[--text-secondary]">Evaluating project...</div>';
    }

    try {
        const items = await computeSimulationChecklist();
        listContainer.innerHTML = '';

        if (!items || !items.length) {
            listContainer.innerHTML = '<div class="p-4 text-xs text-red-400">Failed to load checklist.</div>';
            return;
        }

        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'checklist-item';
            el.style.cssText = 'padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--grid-color); display: flex; align-items: center; gap: 0.5rem;';

            // Status Icon
            let statusColor = 'var(--status-ok)';
            if (item.status === 'warning') statusColor = 'var(--status-warn)';
            if (item.status === 'error') statusColor = 'var(--status-error)';

            const icon = `<div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${statusColor}; flex-shrink: 0;"></div>`;

            el.innerHTML = `
                ${icon}
                <div class="text-xs font-medium">${item.label}</div>
            `;

            // Hover effects
            el.addEventListener('mouseenter', () => {
                if (!el.classList.contains('active')) {
                    el.style.backgroundColor = 'var(--hover-bg)';
                }
            });
            el.addEventListener('mouseleave', () => {
                if (!el.classList.contains('active')) {
                    el.style.backgroundColor = '';
                }
            });

            // Click handler
            el.addEventListener('click', () => {
                // Reset all
                listContainer.querySelectorAll('.checklist-item').forEach(i => {
                    i.classList.remove('active');
                    i.style.backgroundColor = '';
                    i.style.color = '';
                });

                // Set active
                el.classList.add('active');
                el.style.backgroundColor = 'var(--accent-color)';
                el.style.color = 'white';

                renderChecklistStepDetail(panel, item);
            });

            listContainer.appendChild(el);

            // Auto-select if matches current step
            if (panel.dataset.currentStep === item.id) {
                el.click();
            }
        });

        // If no selection, select first
        if (!panel.querySelector('.checklist-item.active') && items.length > 0) {
            listContainer.firstChild.click();
        }

    } catch (err) {
        console.error('Checklist render failed:', err);
        listContainer.innerHTML = '<div class="p-4 text-xs text-red-400">Error loading checklist.</div>';
    }
}

function renderChecklistStepDetail(panel, item) {
    const container = panel.querySelector('#checklist-detail');
    panel.dataset.currentStep = item.id;

    let statusColor = 'text-emerald-400';
    let statusText = 'Ready';
    if (item.status === 'warning') {
        statusColor = 'text-amber-400';
        statusText = 'Warning';
    }
    if (item.status === 'error') {
        statusColor = 'text-red-400';
        statusText = 'Action Required';
    }

    const actionsHtml = item.actions.map(a => `
        <button class="btn btn-sm btn-secondary w-full text-left flex items-center justify-between group" data-action="${a.actionId}">
            <span>${a.label}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-[--text-secondary] group-hover:text-white"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
        </button>
    `).join('');

    container.innerHTML = `
        <div class="space-y-6">
            <div class="border-b border-[--grid-color] pb-4">
                <div class="flex items-center justify-between mb-2">
                    <h2 class="text-lg font-semibold">${item.label}</h2>
                    <span class="text-xs font-bold uppercase px-2 py-1 rounded bg-black/20 ${statusColor} border border-white/10">
                        ${statusText}
                    </span>
                </div>
                <p class="text-sm text-[--text-secondary] leading-relaxed">
                    ${item.description}
                </p>
            </div>

            <div>
                <h3 class="text-xs font-bold uppercase text-[--text-secondary] mb-3">Available Actions</h3>
                <div class="grid grid-cols-1 gap-2">
                    ${actionsHtml}
                </div>
            </div>

            ${item.status !== 'ok' ? `
            <div class="bg-black/20 rounded p-4 border border-white/5">
                <div class="flex items-start gap-3">
                    <div class="mt-0.5 text-amber-400">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    </div>
                    <div class="text-xs text-[--text-secondary]">
                        <p class="font-medium text-[--text-primary] mb-1">Suggestion</p>
                        Use the actions above to resolve any issues. You can also run the full Diagnostics tool for a detailed report.
                    </div>
                </div>
            </div>
            ` : ''}
        </div>
    `;

    // Attach action listeners
    container.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const actionId = btn.dataset.action;
            await handleAction(actionId, panel);
        });
    });
}

async function handleAction(action, panel) {
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
            'open-weather-location': openProjectSetupPanel, // Weather settings are in Project Setup
            'open-sim-control': openProjectSetupPanel, // Simulation control is in Project Setup
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
            renderSidebarList(panel); // Refresh
        }
    } catch (err) {
        console.error('Simulation Checklist action failed:', err);
        alert('Action failed. Check console for details.');
    }
}

// --- LOGIC COPIED FROM energyplusSidebar.js ---

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
                description: 'Project zones detected. Your geometry appears ready for simulation.',
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
                description: 'Missing constructions or materials referenced by the model. Please review the diagnostics.',
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
                ? 'Constructions and materials are configured.'
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
            { label: 'Annual Simulation', actionId: 'open-annual' },
            { label: 'Heating Design Day', actionId: 'open-heating-dd' },
            { label: 'Cooling Design Day', actionId: 'open-cooling-dd' },
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
