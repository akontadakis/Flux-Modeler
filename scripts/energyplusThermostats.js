
import { getDom } from './dom.js';
import { project } from './project.js';
import {
    getConfig,
    setThermostatsAndIdealLoads,
    setSizingZones,
    setSizingSystems,
    setSizingPlants,
    setSizingParameters
} from './energyplusConfigService.js';

let dom;

// Helper to get zones and schedules (mocked or from project)
function getZones() {
    if (project && typeof project.getZones === 'function') {
        return project.getZones() || [];
    }
    return [];
}

function getScheduleNames() {
    const { config } = getConfig(project);
    const schedules = config.schedules || {};
    const names = [];
    if (schedules.dayHourly) names.push(...schedules.dayHourly.map(s => s.name));
    if (schedules.compact) names.push(...schedules.compact.map(s => s.name));
    if (schedules.constant) names.push(...schedules.constant.map(s => s.name));
    if (schedules.file) names.push(...schedules.file.map(s => s.name));
    if (schedules.year) names.push(...schedules.year.map(s => s.name));
    return [...new Set(names)].sort();
}

const TOOLTIPS = {
    // Thermostats
    name: "The unique name of this thermostat object.",
    controlType: "Specifies the control type: DualSetpoint, SingleHeating, SingleCooling, or SingleHeatingOrCooling.",
    heatingScheduleName: "Schedule defining the heating setpoint temperature over time.",
    constantHeatingSetpoint: "A constant heating setpoint temperature (°C) used if no schedule is provided.",
    coolingScheduleName: "Schedule defining the cooling setpoint temperature over time.",
    constantCoolingSetpoint: "A constant cooling setpoint temperature (°C) used if no schedule is provided.",

    // Ideal Loads
    availabilitySchedule: "Schedule defining when the ideal loads system is available to operate.",
    templateThermostatName: "The name of the thermostat object controlling this zone.",
    maxHeatingSupplyAirTemperature: "Maximum allowed temperature (°C) of the air supplied for heating.",
    maxHeatingSupplyAirHumidityRatio: "Maximum allowed humidity ratio (kgWater/kgDryAir) of the air supplied for heating.",
    heatingLimitType: "Type of limit on heating capacity: NoLimit, LimitFlowRate, LimitCapacity, or LimitFlowRateAndCapacity.",
    maxHeatingAirFlowRate: "Maximum heating supply air flow rate (m³/s). Can be 'Autosize'.",
    maxSensibleHeatingCapacity: "Maximum sensible heating capacity (W). Can be 'Autosize'.",
    heatingAvailabilitySchedule: "Schedule defining when heating is available.",
    minCoolingSupplyAirTemperature: "Minimum allowed temperature (°C) of the air supplied for cooling.",
    minCoolingSupplyAirHumidityRatio: "Minimum allowed humidity ratio (kgWater/kgDryAir) of the air supplied for cooling.",
    coolingLimitType: "Type of limit on cooling capacity: NoLimit, LimitFlowRate, LimitCapacity, or LimitFlowRateAndCapacity.",
    maxCoolingAirFlowRate: "Maximum cooling supply air flow rate (m³/s). Can be 'Autosize'.",
    maxTotalCoolingCapacity: "Maximum total cooling capacity (W). Can be 'Autosize'.",
    coolingAvailabilitySchedule: "Schedule defining when cooling is available.",
    dehumidificationControlType: "Control type for dehumidification: ConstantSensibleHeatRatio, Humidistat, None, or ConstantSupplyHumidityRatio.",
    coolingSensibleHeatRatio: "Sensible Heat Ratio (SHR) used when Dehumidification Control Type is ConstantSensibleHeatRatio.",
    dehumidificationSetpoint: "Humidity ratio setpoint (0-1) when Dehumidification Control Type is ConstantSupplyHumidityRatio.",
    humidificationControlType: "Control type for humidification: None, Humidistat, or ConstantSupplyHumidityRatio.",
    humidificationSetpoint: "Humidity ratio setpoint (0-1) when Humidification Control Type is ConstantSupplyHumidityRatio.",
    outdoorAirMethod: "Method for calculating outdoor air flow: None, Flow/Zone, Flow/Person, Flow/Area, Sum, Maximum, or DetailedSpecification.",
    outdoorAirFlowRatePerPerson: "Outdoor air flow rate per person (m³/s-person).",
    outdoorAirFlowRatePerZoneFloorArea: "Outdoor air flow rate per zone floor area (m³/s-m²).",
    outdoorAirFlowRatePerZone: "Total outdoor air flow rate for the zone (m³/s).",
    designSpecificationOutdoorAirObjectName: "Name of a DesignSpecification:OutdoorAir object for detailed OA requirements.",
    demandControlledVentilationType: "Type of demand controlled ventilation: None, OccupancySchedule, or CO2Setpoint.",
    outdoorAirEconomizerType: "Type of outdoor air economizer: NoEconomizer, DifferentialDryBulb, or DifferentialEnthalpy.",
    heatRecoveryType: "Type of heat recovery: None, Sensible, or Enthalpy.",
    sensibleHeatRecoveryEffectiveness: "Sensible heat recovery effectiveness (0-1).",
    latentHeatRecoveryEffectiveness: "Latent heat recovery effectiveness (0-1).",

    // Sizing:Zone
    zoneHeatingSizingFactor: "Global heating sizing factor for this zone.",
    zoneCoolingSizingFactor: "Global cooling sizing factor for this zone.",
    accountForDedicatedOutdoorAirSystem: "Whether to account for the heat impact of a DOAS system.",
    typeOfSpaceSumToUse: "Method to sum space loads: Coincident or Noncoincident.",
    zoneCoolingDesignSupplyAirTemperatureInputMethod: "Method to define cooling supply air temp: SupplyAirTemperature or TemperatureDifference.",
    zoneCoolingDesignSupplyAirTemperature: "Design cooling supply air temperature (°C).",
    zoneCoolingDesignSupplyAirTemperatureDifference: "Design cooling supply air temperature difference (delta T) (°C).",
    zoneCoolingDesignSupplyAirHumidityRatio: "Design cooling supply air humidity ratio (kg/kg).",
    coolingDesignAirFlowMethod: "Method for calculating cooling design air flow: DesignDay, Flow/Zone, or DesignDayWithLimit.",
    coolingDesignAirFlowRate: "User-specified cooling design air flow rate (m³/s).",
    coolingMinimumAirFlowPerZoneFloorArea: "Minimum cooling air flow per zone floor area (m³/s-m²).",
    coolingMinimumAirFlow: "Minimum cooling air flow rate (m³/s).",
    coolingMinimumAirFlowFraction: "Minimum cooling air flow as a fraction of the design flow rate.",
    zoneHeatingDesignSupplyAirTemperatureInputMethod: "Method to define heating supply air temp: SupplyAirTemperature or TemperatureDifference.",
    zoneHeatingDesignSupplyAirTemperature: "Design heating supply air temperature (°C).",
    zoneHeatingDesignSupplyAirTemperatureDifference: "Design heating supply air temperature difference (delta T) (°C).",
    zoneHeatingDesignSupplyAirHumidityRatio: "Design heating supply air humidity ratio (kg/kg).",
    heatingDesignAirFlowMethod: "Method for calculating heating design air flow: DesignDay, Flow/Zone, or DesignDayWithLimit.",
    heatingDesignAirFlowRate: "User-specified heating design air flow rate (m³/s).",
    heatingMaximumAirFlowPerZoneFloorArea: "Maximum heating air flow per zone floor area (m³/s-m²).",
    heatingMaximumAirFlow: "Maximum heating air flow rate (m³/s).",
    heatingMaximumAirFlowFraction: "Maximum heating air flow as a fraction of the design flow rate.",
    designSpecOutdoorAirName: "Name of the DesignSpecification:OutdoorAir object.",
    designSpecificationZoneAirDistributionObjectName: "Name of the DesignSpecification:ZoneAirDistribution object.",
    dedicatedOutdoorAirSystemControlStrategy: "DOAS control strategy: NeutralSupplyAir, NeutralDehumidifiedSupplyAir, or ColdSupplyAir.",
    dedicatedOutdoorAirLowTemperatureSetpointForDesign: "DOAS low temperature setpoint for design (°C).",
    dedicatedOutdoorAirHighTemperatureSetpointForDesign: "DOAS high temperature setpoint for design (°C).",
    zoneLoadSizingMethod: "Method for zone load sizing: Sensible Load, Latent Load, etc.",
    zoneLatentCoolingDesignSupplyAirHumidityRatioInputMethod: "Method for latent cooling humidity ratio: SupplyAirHumidityRatio or HumidityRatioDifference.",
    zoneDehumidificationDesignSupplyAirHumidityRatio: "Design supply air humidity ratio for dehumidification (kg/kg).",
    zoneCoolingDesignSupplyAirHumidityRatioDifference: "Humidity ratio difference for cooling design (kg/kg).",
    zoneLatentHeatingDesignSupplyAirHumidityRatioInputMethod: "Method for latent heating humidity ratio: SupplyAirHumidityRatio or HumidityRatioDifference.",
    zoneHumidificationDesignSupplyAirHumidityRatio: "Design supply air humidity ratio for humidification (kg/kg).",
    zoneHeatingDesignSupplyAirHumidityRatioDifference: "Humidity ratio difference for heating design (kg/kg).",
    zoneHumidistatDehumidificationSetPointScheduleName: "Schedule for humidistat dehumidification setpoint.",
    zoneHumidistatHumidificationSetPointScheduleName: "Schedule for humidistat humidification setpoint.",

    // Sizing:System
    airLoopName: "Name of the Air Loop.",
    typeOfLoadToSizeOn: "Type of load to size on: Sensible, Latent, Total, or VentilationRequirement.",
    designOutdoorAirFlowRate: "Design outdoor air flow rate (m³/s). Can be 'Autosize'.",
    centralHeatingMaximumSystemAirFlowRatio: "Ratio of max heating flow to max cooling flow.",
    typeOfZoneSumToUse: "Method to sum zone loads: Coincident or Noncoincident.",
    occupantDiversity: "Occupant diversity factor (0-1) or 'Autosize'.",
    preheatDesignTemperature: "Design temperature for preheat coil (°C).",
    preheatDesignHumidityRatio: "Design humidity ratio for preheat coil (kg/kg).",
    precoolDesignTemperature: "Design temperature for precool coil (°C).",
    precoolDesignHumidityRatio: "Design humidity ratio for precool coil (kg/kg).",
    centralCoolingDesignSupplyAirTemperature: "Design supply air temperature for central cooling (°C).",
    centralCoolingDesignSupplyAirHumidityRatio: "Design supply air humidity ratio for central cooling (kg/kg).",
    centralHeatingDesignSupplyAirTemperature: "Design supply air temperature for central heating (°C).",
    centralHeatingDesignSupplyAirHumidityRatio: "Design supply air humidity ratio for central heating (kg/kg).",
    coolingSupplyAirFlowRateMethod: "Method for cooling supply air flow sizing.",
    coolingSupplyAirFlowRate: "User-specified cooling supply air flow rate (m³/s).",
    coolingSupplyAirFlowRatePerFloorArea: "Cooling supply air flow per floor area (m³/s-m²).",
    coolingFractionOfAutosizedCoolingDesignSupplyAirFlowRate: "Fraction of autosized cooling design flow rate.",
    coolingSupplyAirFlowRatePerUnitCoolingCapacity: "Cooling supply air flow per unit cooling capacity (m³/s-W).",
    coolingDesignCapacityMethod: "Method for cooling design capacity sizing.",
    coolingDesignCapacity: "User-specified cooling design capacity (W). Can be 'Autosize'.",
    coolingDesignCapacityPerFloorArea: "Cooling design capacity per floor area (W/m²).",
    fractionOfAutosizedCoolingDesignCapacity: "Fraction of autosized cooling design capacity.",
    allOutdoorAirInCooling: "Whether to use 100% outdoor air in cooling mode.",
    centralCoolingCapacityControlMethod: "Control method for central cooling capacity: VAV, Bypass, VT, or OnOff.",
    heatingSupplyAirFlowRateMethod: "Method for heating supply air flow sizing.",
    heatingSupplyAirFlowRate: "User-specified heating supply air flow rate (m³/s).",
    heatingSupplyAirFlowRatePerFloorArea: "Heating supply air flow per floor area (m³/s-m²).",
    heatingFractionOfAutosizedHeatingSupplyAirFlowRate: "Fraction of autosized heating design flow rate.",
    heatingFractionOfAutosizedCoolingSupplyAirFlowRate: "Fraction of autosized cooling design flow rate used for heating.",
    heatingDesignSupplyAirFlowRatePerUnitHeatingCapacity: "Heating supply air flow per unit heating capacity (m³/s-W).",
    heatingDesignCapacityMethod: "Method for heating design capacity sizing.",
    heatingDesignCapacity: "User-specified heating design capacity (W). Can be 'Autosize'.",
    heatingDesignCapacityPerFloorArea: "Heating design capacity per floor area (W/m²).",
    fractionOfAutosizedHeatingDesignCapacity: "Fraction of autosized heating design capacity.",
    allOutdoorAirInHeating: "Whether to use 100% outdoor air in heating mode.",
    systemOutdoorAirMethod: "Method for calculating system outdoor air: ZoneSum or Standard62.1.",
    zoneMaximumOutdoorAirFraction: "Maximum fraction of outdoor air allowed for zones.",

    // Sizing:Plant
    plantLoopName: "Name of the Plant Loop.",
    loopType: "Type of plant loop: Heating, Cooling, Condenser, or Steam.",
    designLoopExitTemperature: "Design temperature of fluid leaving the plant loop (°C).",
    loopDesignTemperatureDifference: "Design temperature difference across the plant loop (°C).",
    sizingOption: "Sizing option: NonCoincident or Coincident.",
    zoneTimestepsInAveragingWindow: "Number of zone timesteps used in the averaging window.",
    coincidentSizingFactorMode: "Mode for applying coincident sizing factors."
};

export function openThermostatsPanel() {
    dom = getDom();
    const panelId = 'panel-energyplus-thermostats';
    const btnId = 'toggle-panel-thermostats-btn';
    const btn = document.getElementById(btnId);

    let panel = document.getElementById(panelId);

    // If panel exists and is visible, toggle it closed
    if (panel && !panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
        if (btn) btn.classList.remove('active');
        return;
    }

    // Otherwise, open the panel
    if (!panel) {
        panel = createThermostatsPanel();
        const container = document.getElementById('window-container');
        container.appendChild(panel);
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

    // Default view
    if (!panel.dataset.currentView) {
        panel.dataset.currentView = 'thermostats';
    }

    renderSidebarList(panel);
}

function createThermostatsPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-energyplus-thermostats';
    panel.className = 'floating-window ui-panel resizable-panel';

    panel.style.width = '600px';
    panel.style.height = '500px';

    panel.innerHTML = `
        <div class="window-header">
            <span>Thermostats & Ideal Loads</span>
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
                    <div style="padding: 0.5rem; border-bottom: 1px solid var(--grid-color); display: flex; justify-content: space-between; align-items: center;">
                        <span class="label">Configuration</span>
                        <button class="btn btn-xs btn-secondary" id="add-item-btn" title="Add New Thermostat" style="display: none;">+</button>
                    </div>
                    <div id="tstat-list" class="scrollable-panel-inner" style="flex: 1; overflow-y: auto;">
                        <!-- List items injected here -->
                    </div>
                </div>

                <!-- Right Content: Editor -->
                <div id="tstat-editor" style="flex: 1; padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
                    <div class="text-[--text-secondary] text-sm text-center mt-10">Select an item to edit.</div>
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

    // No more toggle setup, just render list
    renderSidebarList(panel);

    // Add button logic
    const addBtn = panel.querySelector('#add-item-btn');
    addBtn.addEventListener('click', () => {
        renderThermostatEditor(panel, null, true);
    });

    return panel;
}

// Removed setupViewToggles as it's no longer needed

function renderSidebarList(panel) {
    const listContainer = panel.querySelector('#tstat-list');
    const { config } = getConfig(project);
    const addBtn = panel.querySelector('#add-item-btn');

    listContainer.innerHTML = '';

    const createHeader = (label) => {
        const header = document.createElement('div');
        // Match the "Configuration" label style but slightly smaller/distinct for sections if needed
        // Or just use the exact same style as the top label
        header.style.cssText = 'padding: 0.5rem 0.75rem; margin-top: 0.5rem;';
        header.innerHTML = `<span class="label" style="font-size: 0.75rem; color: var(--text-secondary);">${label}</span>`;
        return header;
    };

    const createItem = (label, dataAttributes) => {
        const item = document.createElement('div');
        item.className = 'tstat-item';
        // Match Project Setup styling exactly
        item.style.cssText = 'padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--grid-color);';

        // Add data attributes
        Object.entries(dataAttributes).forEach(([key, value]) => {
            item.dataset[key] = value;
        });

        // Use standard text-xs, no bold for special items
        item.innerHTML = `<div class="text-xs">${label}</div>`;

        // Hover effects (mimicking Project Setup)
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
            listContainer.querySelectorAll('.tstat-item').forEach(el => {
                el.classList.remove('active');
                el.style.backgroundColor = '';
                el.style.color = '';
            });

            // Set active state
            item.classList.add('active');
            item.style.backgroundColor = 'var(--accent-color)';
            item.style.color = 'white';

            // Show/Hide Add Button based on context
            if (dataAttributes.context === 'thermostats') {
                addBtn.style.display = 'block';
            } else {
                addBtn.style.display = 'none';
            }

            // Trigger action
            if (dataAttributes.special === 'assignments') {
                renderZoneAssignments(panel);
            } else if (dataAttributes.special === 'global') {
                renderIdealLoadsGlobal(panel);
            } else if (dataAttributes.zone) {
                renderIdealLoadsZone(panel, dataAttributes.zone);
            } else if (dataAttributes.sizing) {
                renderSizingView(panel, dataAttributes.sizing);
            } else if (dataAttributes.name) {
                const t = (config.thermostats || []).find(x => x.name === dataAttributes.name && x.scope === 'setpoint');
                renderThermostatEditor(panel, t, false);
            }
        });

        return item;
    };

    // --- THERMOSTATS SECTION ---
    listContainer.appendChild(createHeader('Thermostats'));
    listContainer.appendChild(createItem('Zone Assignments', { special: 'assignments', context: 'thermostats' }));

    const thermostats = (config.thermostats || []).filter(t => t.scope === 'setpoint');
    if (thermostats.length > 0) {
        thermostats.forEach(t => {
            listContainer.appendChild(createItem(t.name, { name: t.name, context: 'thermostats' }));
        });
    }

    // --- IDEAL LOADS SECTION ---
    listContainer.appendChild(createHeader('Ideal Loads'));
    listContainer.appendChild(createItem('Global Settings', { special: 'global', context: 'idealloads' }));

    const zones = getZones();
    // Limit displayed zones to avoid massive lists, or maybe just list them all?
    // Project Setup lists all categories. Schedules lists all schedules.
    // We will list all zones.
    zones.forEach(z => {
        listContainer.appendChild(createItem(z.name, { zone: z.name, context: 'idealloads' }));
    });

    // --- HVAC SIZING SECTION ---
    listContainer.appendChild(createHeader('HVAC Sizing'));
    const sizingItems = [
        { id: 'global-sizing', label: 'Global Sizing' },
        { id: 'zone-sizing', label: 'Zone Sizing' },
        { id: 'system-sizing', label: 'System Sizing' },
        { id: 'plant-sizing', label: 'Plant Sizing' }
    ];

    sizingItems.forEach(item => {
        listContainer.appendChild(createItem(item.label, { sizing: item.id, context: 'sizing' }));
    });
}

// ==========================================
// THERMOSTATS EDITORS
// ==========================================

function renderThermostatEditor(panel, data, isNew) {
    const container = panel.querySelector('#tstat-editor');
    const schedNames = getScheduleNames();
    const name = data?.name || '';
    const type = data?.type || 'DualSetpoint';

    const schedOptions = (selected) => {
        let html = '<option value="">(none)</option>';
        schedNames.forEach((nm) => {
            const sel = nm === selected ? ' selected' : '';
            html += `<option value="${nm}"${sel}>${nm}</option>`;
        });
        return html;
    };

    const renderLabel = (text, key) => {
        const tooltip = TOOLTIPS[key];
        const infoIcon = tooltip ? `
            <span class="info-icon">i
                <span class="info-popover">${tooltip}</span>
            </span>
        ` : '';
        return `<label class="label">${text}${infoIcon}</label>`;
    };

    let html = `
        <div class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">
                ${isNew ? 'New Thermostat Setpoint' : 'Edit Thermostat Setpoint'}
            </h3>

            <div>
                ${renderLabel('Name', 'name')}
                <input type="text" id="ts-name" class="w-full mt-1" value="${name}">
            </div>

            <div>
                ${renderLabel('Control Type', 'controlType')}
                <select id="ts-type" class="w-full mt-1">
                    <option value="DualSetpoint" ${type === 'DualSetpoint' ? 'selected' : ''}>DualSetpoint</option>
                    <option value="SingleHeating" ${type === 'SingleHeating' ? 'selected' : ''}>SingleHeating</option>
                    <option value="SingleCooling" ${type === 'SingleCooling' ? 'selected' : ''}>SingleCooling</option>
                    <option value="SingleHeatingOrCooling" ${type === 'SingleHeatingOrCooling' ? 'selected' : ''}>SingleHeatingOrCooling</option>
                </select>
            </div>

            <div id="ts-scheds-container" class="space-y-4">
                <!-- Injected based on type -->
            </div>

            <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                ${!isNew ? '<button class="btn btn-sm btn-danger" id="ts-delete-btn">Delete</button>' : ''}
                <button class="btn btn-sm btn-primary" id="ts-save-btn">Save</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    const updateSchedInputs = (t) => {
        const div = container.querySelector('#ts-scheds-container');
        if (t === 'DualSetpoint') {
            div.innerHTML = `
                <div>
                    ${renderLabel('Heating Schedule', 'heatingScheduleName')}
                    <select id="ts-heat-sched" class="w-full mt-1">${schedOptions(data?.heatingScheduleName)}</select>
                </div>
                <div>
                    ${renderLabel('Constant Heating Setpoint [°C]', 'constantHeatingSetpoint')}
                    <input type="number" id="ts-heat-const" class="w-full mt-1" value="${data?.constantHeatingSetpoint || ''}" step="0.1">
                </div>
                <div>
                    ${renderLabel('Cooling Schedule', 'coolingScheduleName')}
                    <select id="ts-cool-sched" class="w-full mt-1">${schedOptions(data?.coolingScheduleName)}</select>
                </div>
                <div>
                    ${renderLabel('Constant Cooling Setpoint [°C]', 'constantCoolingSetpoint')}
                    <input type="number" id="ts-cool-const" class="w-full mt-1" value="${data?.constantCoolingSetpoint || ''}" step="0.1">
                </div>
            `;
        } else {
            // For single setpoints, we map to heating/cooling fields based on type for storage, or just generic "single" fields?
            // The save logic below handles mapping back to specific fields.
            // We'll use generic labels here but map to specific keys for tooltips if possible, or just use generic ones.
            // Let's use 'heatingScheduleName' etc as fallback for tooltips.
            div.innerHTML = `
                <div>
                    ${renderLabel('Setpoint Schedule', 'heatingScheduleName')}
                    <select id="ts-single-sched" class="w-full mt-1">${schedOptions(data?.singleScheduleName || data?.heatingScheduleName || data?.coolingScheduleName)}</select>
                </div>
                <div>
                    ${renderLabel('Constant Setpoint [°C]', 'constantHeatingSetpoint')}
                    <input type="number" id="ts-single-const" class="w-full mt-1" value="${data?.constantHeatingSetpoint || data?.constantCoolingSetpoint || ''}" step="0.1">
                </div>
            `;
        }
    };

    updateSchedInputs(type);
    container.querySelector('#ts-type').addEventListener('change', (e) => updateSchedInputs(e.target.value));

    container.querySelector('#ts-save-btn').addEventListener('click', () => {
        const newName = container.querySelector('#ts-name').value.trim();
        if (!newName) return alert('Name is required');

        const newType = container.querySelector('#ts-type').value;
        const newItem = { name: newName, type: newType, scope: 'setpoint' };

        if (newType === 'DualSetpoint') {
            newItem.heatingScheduleName = container.querySelector('#ts-heat-sched').value;
            newItem.constantHeatingSetpoint = container.querySelector('#ts-heat-const').value ? parseFloat(container.querySelector('#ts-heat-const').value) : undefined;
            newItem.coolingScheduleName = container.querySelector('#ts-cool-sched').value;
            newItem.constantCoolingSetpoint = container.querySelector('#ts-cool-const').value ? parseFloat(container.querySelector('#ts-cool-const').value) : undefined;
        } else {
            newItem.singleScheduleName = container.querySelector('#ts-single-sched').value;
            const constVal = container.querySelector('#ts-single-const').value ? parseFloat(container.querySelector('#ts-single-const').value) : undefined;

            if (newType === 'SingleHeating') {
                newItem.heatingScheduleName = newItem.singleScheduleName;
                newItem.constantHeatingSetpoint = constVal;
            }
            if (newType === 'SingleCooling') {
                newItem.coolingScheduleName = newItem.singleScheduleName;
                newItem.constantCoolingSetpoint = constVal;
            }
        }

        const { config } = getConfig(project);
        let list = [...(config.thermostats || [])];

        // Remove old if editing
        if (!isNew) list = list.filter(x => !(x.name === name && x.scope === 'setpoint'));
        // Remove duplicates
        list = list.filter(x => !(x.name === newName && x.scope === 'setpoint'));

        list.push(newItem);

        // Save
        setThermostatsAndIdealLoads(project, list, config.idealLoads);
        renderSidebarList(panel);
        renderThermostatEditor(panel, newItem, false);
    });

    if (!isNew) {
        container.querySelector('#ts-delete-btn').addEventListener('click', () => {
            if (confirm(`Delete thermostat setpoint "${name}"?`)) {
                const { config } = getConfig(project);
                const list = (config.thermostats || []).filter(x => !(x.name === name && x.scope === 'setpoint'));
                setThermostatsAndIdealLoads(project, list, config.idealLoads);
                renderSidebarList(panel);
                container.innerHTML = '<div class="text-[--text-secondary] text-sm text-center mt-10">Select an item to edit.</div>';
            }
        });
    }
}

function renderZoneAssignments(panel) {
    const container = panel.querySelector('#tstat-editor');
    const { config } = getConfig(project);
    const zones = getZones();
    const schedNames = getScheduleNames();
    const setpoints = (config.thermostats || []).filter(t => t.scope === 'setpoint');

    // Build map of existing assignments
    const assignments = new Map();
    (config.thermostats || []).forEach(t => {
        if (t.scope !== 'setpoint' && t.zoneName) {
            assignments.set(t.zoneName, t);
        }
    });

    const setpointOptions = (selected, filterType) => {
        let html = '<option value="">(none)</option>';
        setpoints.forEach(sp => {
            if (!filterType || sp.type === filterType) {
                const sel = sp.name === selected ? ' selected' : '';
                html += `<option value="${sp.name}"${sel}>${sp.name}</option>`;
            }
        });
        return html;
    };

    const schedOptions = (selected) => {
        let html = '<option value="">(none)</option>';
        schedNames.forEach(nm => {
            const sel = nm === selected ? ' selected' : '';
            html += `<option value="${nm}"${sel}>${nm}</option>`;
        });
        return html;
    };

    let html = `
        <div class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Zone Thermostat Assignments</h3>
            <p class="text-xs text-[--text-secondary]">Assign thermostat setpoints and control schedules to each zone.</p>
            
            <div class="border border-gray-700/50 rounded bg-black/20 overflow-hidden">
                <table class="w-full text-xs">
                    <thead class="bg-black/40 text-[--text-secondary]">
                        <tr>
                            <th class="px-2 py-2 text-left font-medium">Zone</th>
                            <th class="px-2 py-2 text-left font-medium">Control Type Sched</th>
                            <th class="px-2 py-2 text-left font-medium">Dual Setpoint</th>
                            <th class="px-2 py-2 text-left font-medium">Single Heat</th>
                            <th class="px-2 py-2 text-left font-medium">Single Cool</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-700/30">
    `;

    zones.forEach(z => {
        const a = assignments.get(z.name) || {};
        html += `
            <tr data-zone="${z.name}">
                <td class="px-2 py-2 text-[--accent-color]">${z.name}</td>
                <td class="px-2 py-2"><select class="w-full bg-black/40 border border-gray-600 rounded px-1 py-0.5" data-field="controlTypeSchedule">${schedOptions(a.controlTypeSchedule)}</select></td>
                <td class="px-2 py-2"><select class="w-full bg-black/40 border border-gray-600 rounded px-1 py-0.5" data-field="dualSetpoint">${setpointOptions(a.dualSetpoint, 'DualSetpoint')}</select></td>
                <td class="px-2 py-2"><select class="w-full bg-black/40 border border-gray-600 rounded px-1 py-0.5" data-field="singleHeatingSetpoint">${setpointOptions(a.singleHeatingSetpoint, 'SingleHeating')}</select></td>
                <td class="px-2 py-2"><select class="w-full bg-black/40 border border-gray-600 rounded px-1 py-0.5" data-field="singleCoolingSetpoint">${setpointOptions(a.singleCoolingSetpoint, 'SingleCooling')}</select></td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
            </div>
            <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                <button class="btn btn-sm btn-primary" id="assign-save-btn">Save Assignments</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    container.querySelector('#assign-save-btn').addEventListener('click', () => {
        const newAssignments = [];
        container.querySelectorAll('tbody tr').forEach(tr => {
            const zoneName = tr.dataset.zone;
            const controlTypeSchedule = tr.querySelector('[data-field="controlTypeSchedule"]').value;
            const dualSetpoint = tr.querySelector('[data-field="dualSetpoint"]').value;
            const singleHeatingSetpoint = tr.querySelector('[data-field="singleHeatingSetpoint"]').value;
            const singleCoolingSetpoint = tr.querySelector('[data-field="singleCoolingSetpoint"]').value;

            if (controlTypeSchedule || dualSetpoint || singleHeatingSetpoint || singleCoolingSetpoint) {
                newAssignments.push({
                    zoneName,
                    controlTypeSchedule,
                    dualSetpoint,
                    singleHeatingSetpoint,
                    singleCoolingSetpoint,
                    // Implicitly not 'setpoint' scope
                });
            }
        });

        // Merge with setpoints
        const setpointsOnly = (config.thermostats || []).filter(t => t.scope === 'setpoint');
        const finalList = [...setpointsOnly, ...newAssignments];

        setThermostatsAndIdealLoads(project, finalList, config.idealLoads);
        alert('Zone assignments saved.');
    });
}

// ==========================================
// IDEAL LOADS EDITORS
// ==========================================

function renderIdealLoadsGlobal(panel) {
    const container = panel.querySelector('#tstat-editor');
    const { config } = getConfig(project);
    const global = config.idealLoads?.global || {};
    const schedNames = getScheduleNames();

    const renderLabel = (text, key) => {
        const tooltip = TOOLTIPS[key];
        const infoIcon = tooltip ? `
            <span class="info-icon">i
                <span class="info-popover">${tooltip}</span>
            </span>
        ` : '';
        return `<label class="label">${text}${infoIcon}</label>`;
    };

    const limitOpts = (sel) => `
        <option value="NoLimit" ${sel === 'NoLimit' ? 'selected' : ''}>NoLimit</option>
        <option value="LimitFlowRate" ${sel === 'LimitFlowRate' ? 'selected' : ''}>LimitFlowRate</option>
        <option value="LimitCapacity" ${sel === 'LimitCapacity' ? 'selected' : ''}>LimitCapacity</option>
        <option value="LimitFlowRateAndCapacity" ${sel === 'LimitFlowRateAndCapacity' ? 'selected' : ''}>LimitFlowRateAndCapacity</option>
    `;

    const schedOpts = (sel) => {
        let html = '<option value="">(none)</option>';
        schedNames.forEach(n => html += `<option value="${n}" ${n === sel ? 'selected' : ''}>${n}</option>`);
        return html;
    };

    const dehumidOpts = (sel) => `
        <option value="ConstantSensibleHeatRatio" ${sel === 'ConstantSensibleHeatRatio' ? 'selected' : ''}>ConstantSensibleHeatRatio</option>
        <option value="Humidistat" ${sel === 'Humidistat' ? 'selected' : ''}>Humidistat</option>
        <option value="None" ${sel === 'None' ? 'selected' : ''}>None</option>
        <option value="ConstantSupplyHumidityRatio" ${sel === 'ConstantSupplyHumidityRatio' ? 'selected' : ''}>ConstantSupplyHumidityRatio</option>
    `;

    const humidOpts = (sel) => `
        <option value="None" ${sel === 'None' ? 'selected' : ''}>None</option>
        <option value="Humidistat" ${sel === 'Humidistat' ? 'selected' : ''}>Humidistat</option>
        <option value="ConstantSupplyHumidityRatio" ${sel === 'ConstantSupplyHumidityRatio' ? 'selected' : ''}>ConstantSupplyHumidityRatio</option>
    `;

    const oaMethodOpts = (sel) => `
        <option value="None" ${sel === 'None' ? 'selected' : ''}>None</option>
        <option value="Flow/Person" ${sel === 'Flow/Person' ? 'selected' : ''}>Flow/Person</option>
        <option value="Flow/Area" ${sel === 'Flow/Area' ? 'selected' : ''}>Flow/Area</option>
        <option value="Flow/Zone" ${sel === 'Flow/Zone' ? 'selected' : ''}>Flow/Zone</option>
        <option value="Sum" ${sel === 'Sum' ? 'selected' : ''}>Sum</option>
        <option value="Maximum" ${sel === 'Maximum' ? 'selected' : ''}>Maximum</option>
        <option value="DetailedSpecification" ${sel === 'DetailedSpecification' ? 'selected' : ''}>DetailedSpecification</option>
    `;

    const dcvOpts = (sel) => `
        <option value="None" ${sel === 'None' ? 'selected' : ''}>None</option>
        <option value="OccupancySchedule" ${sel === 'OccupancySchedule' ? 'selected' : ''}>OccupancySchedule</option>
        <option value="CO2Setpoint" ${sel === 'CO2Setpoint' ? 'selected' : ''}>CO2Setpoint</option>
    `;

    const econOpts = (sel) => `
        <option value="NoEconomizer" ${sel === 'NoEconomizer' ? 'selected' : ''}>NoEconomizer</option>
        <option value="DifferentialDryBulb" ${sel === 'DifferentialDryBulb' ? 'selected' : ''}>DifferentialDryBulb</option>
        <option value="DifferentialEnthalpy" ${sel === 'DifferentialEnthalpy' ? 'selected' : ''}>DifferentialEnthalpy</option>
    `;

    const heatRecOpts = (sel) => `
        <option value="None" ${sel === 'None' ? 'selected' : ''}>None</option>
        <option value="Sensible" ${sel === 'Sensible' ? 'selected' : ''}>Sensible</option>
        <option value="Enthalpy" ${sel === 'Enthalpy' ? 'selected' : ''}>Enthalpy</option>
    `;

    const formatAutosize = (val) => val === 'Autosize' ? 'Autosize' : (val !== undefined ? val : '');
    const parseAutosize = (val) => {
        const v = val.trim();
        if (v.toLowerCase() === 'autosize') return 'Autosize';
        if (v === '') return undefined;
        const n = parseFloat(v);
        return isNaN(n) ? undefined : n;
    };

    let html = `
        <div class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Global Ideal Loads Defaults</h3>
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    ${renderLabel('Availability Schedule', 'availabilitySchedule')}
                    <select id="il-avail" class="w-full mt-1">${schedOpts(global.availabilitySchedule)}</select>
                </div>
            </div>

            <!-- Heating Settings -->
            <div class="border-t border-[--grid-color] pt-2 mt-2"><span class="text-xs font-bold text-[--text-secondary]">Heating</span></div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    ${renderLabel('Max Heating Supply Temp [°C]', 'maxHeatingSupplyAirTemperature')}
                    <input type="number" id="il-max-heat" class="w-full mt-1" value="${global.maxHeatingSupplyAirTemperature || 50}">
                </div>
                <div>
                    ${renderLabel('Max Heating Humidity Ratio', 'maxHeatingSupplyAirHumidityRatio')}
                    <input type="number" step="0.0001" id="il-max-heat-hum" class="w-full mt-1" value="${global.maxHeatingSupplyAirHumidityRatio || 0.0156}">
                </div>
                <div>
                    ${renderLabel('Heating Limit Type', 'heatingLimitType')}
                    <select id="il-heat-limit" class="w-full mt-1">${limitOpts(global.heatingLimitType || 'NoLimit')}</select>
                </div>
                <div>
                    ${renderLabel('Max Heating Air Flow [m³/s]', 'maxHeatingAirFlowRate')}
                    <input type="text" id="il-max-heat-flow" class="w-full mt-1" value="${formatAutosize(global.maxHeatingAirFlowRate)}" placeholder="Autosize">
                </div>
                <div>
                    ${renderLabel('Max Sensible Heating Cap [W]', 'maxSensibleHeatingCapacity')}
                    <input type="text" id="il-max-heat-cap" class="w-full mt-1" value="${formatAutosize(global.maxSensibleHeatingCapacity)}" placeholder="Autosize">
                </div>
                <div>
                    ${renderLabel('Heating Availability Sched', 'heatingAvailabilitySchedule')}
                    <select id="il-heat-avail" class="w-full mt-1">${schedOpts(global.heatingAvailabilitySchedule)}</select>
                </div>
            </div>

            <!-- Cooling Settings -->
            <div class="border-t border-[--grid-color] pt-2 mt-2"><span class="text-xs font-bold text-[--text-secondary]">Cooling</span></div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    ${renderLabel('Min Cooling Supply Temp [°C]', 'minCoolingSupplyAirTemperature')}
                    <input type="number" id="il-min-cool" class="w-full mt-1" value="${global.minCoolingSupplyAirTemperature || 13}">
                </div>
                <div>
                    ${renderLabel('Min Cooling Humidity Ratio', 'minCoolingSupplyAirHumidityRatio')}
                    <input type="number" step="0.0001" id="il-min-cool-hum" class="w-full mt-1" value="${global.minCoolingSupplyAirHumidityRatio || 0.0077}">
                </div>
                <div>
                    ${renderLabel('Cooling Limit Type', 'coolingLimitType')}
                    <select id="il-cool-limit" class="w-full mt-1">${limitOpts(global.coolingLimitType || 'NoLimit')}</select>
                </div>
                <div>
                    ${renderLabel('Max Cooling Air Flow [m³/s]', 'maxCoolingAirFlowRate')}
                    <input type="text" id="il-max-cool-flow" class="w-full mt-1" value="${formatAutosize(global.maxCoolingAirFlowRate)}" placeholder="Autosize">
                </div>
                <div>
                    ${renderLabel('Max Total Cooling Cap [W]', 'maxTotalCoolingCapacity')}
                    <input type="text" id="il-max-cool-cap" class="w-full mt-1" value="${formatAutosize(global.maxTotalCoolingCapacity)}" placeholder="Autosize">
                </div>
                <div>
                    ${renderLabel('Cooling Availability Sched', 'coolingAvailabilitySchedule')}
                    <select id="il-cool-avail" class="w-full mt-1">${schedOpts(global.coolingAvailabilitySchedule)}</select>
                </div>
            </div>

            <!-- Humidity Control -->
            <div class="border-t border-[--grid-color] pt-2 mt-2"><span class="text-xs font-bold text-[--text-secondary]">Humidity Control</span></div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    ${renderLabel('Dehumidification Control', 'dehumidificationControlType')}
                    <select id="il-dehum-type" class="w-full mt-1">${dehumidOpts(global.dehumidificationControlType || 'ConstantSensibleHeatRatio')}</select>
                </div>
                <div>
                    ${renderLabel('Cooling Sensible Heat Ratio', 'coolingSensibleHeatRatio')}
                    <input type="number" step="0.01" id="il-cool-shr" class="w-full mt-1" value="${global.coolingSensibleHeatRatio || 0.7}">
                </div>
                <div>
                    ${renderLabel('Dehumidification Setpoint', 'dehumidificationSetpoint')}
                    <input type="number" step="0.0001" id="il-dehum-setpoint" class="w-full mt-1" value="${global.dehumidificationSetpoint || 0.0156}">
                </div>
                <div>
                    ${renderLabel('Humidification Control', 'humidificationControlType')}
                    <select id="il-hum-type" class="w-full mt-1">${humidOpts(global.humidificationControlType || 'None')}</select>
                </div>
                <div>
                    ${renderLabel('Humidification Setpoint', 'humidificationSetpoint')}
                    <input type="number" step="0.0001" id="il-hum-setpoint" class="w-full mt-1" value="${global.humidificationSetpoint || 0.0077}">
                </div>
            </div>

            <!-- Outdoor Air -->
            <div class="border-t border-[--grid-color] pt-2 mt-2"><span class="text-xs font-bold text-[--text-secondary]">Outdoor Air</span></div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    ${renderLabel('Outdoor Air Method', 'outdoorAirMethod')}
                    <select id="il-oa-method" class="w-full mt-1">${oaMethodOpts(global.outdoorAirMethod || 'None')}</select>
                </div>
                <div>
                    ${renderLabel('Flow per Person [m³/s]', 'outdoorAirFlowRatePerPerson')}
                    <input type="number" step="0.001" id="il-oa-person" class="w-full mt-1" value="${global.outdoorAirFlowRatePerPerson || 0.00944}">
                </div>
                <div>
                    ${renderLabel('Flow per Area [m³/s-m²]', 'outdoorAirFlowRatePerZoneFloorArea')}
                    <input type="number" step="0.0001" id="il-oa-area" class="w-full mt-1" value="${global.outdoorAirFlowRatePerZoneFloorArea || 0.0}">
                </div>
                <div>
                    ${renderLabel('Flow per Zone [m³/s]', 'outdoorAirFlowRatePerZone')}
                    <input type="number" step="0.001" id="il-oa-zone" class="w-full mt-1" value="${global.outdoorAirFlowRatePerZone || 0.0}">
                </div>
                <div>
                    ${renderLabel('Design Spec OA Object', 'designSpecificationOutdoorAirObjectName')}
                    <input type="text" id="il-oa-obj" class="w-full mt-1" value="${global.designSpecificationOutdoorAirObjectName || ''}">
                </div>
                <div>
                    ${renderLabel('Demand Controlled Vent', 'demandControlledVentilationType')}
                    <select id="il-dcv-type" class="w-full mt-1">${dcvOpts(global.demandControlledVentilationType || 'None')}</select>
                </div>
                <div>
                    ${renderLabel('Economizer Type', 'outdoorAirEconomizerType')}
                    <select id="il-econ-type" class="w-full mt-1">${econOpts(global.outdoorAirEconomizerType || 'NoEconomizer')}</select>
                </div>
                <div>
                    ${renderLabel('Heat Recovery Type', 'heatRecoveryType')}
                    <select id="il-hr-type" class="w-full mt-1">${heatRecOpts(global.heatRecoveryType || 'None')}</select>
                </div>
                <div>
                    ${renderLabel('Sensible Heat Recovery Eff', 'sensibleHeatRecoveryEffectiveness')}
                    <input type="number" step="0.05" id="il-hr-sens" class="w-full mt-1" value="${global.sensibleHeatRecoveryEffectiveness || 0.7}">
                </div>
                <div>
                    ${renderLabel('Latent Heat Recovery Eff', 'latentHeatRecoveryEffectiveness')}
                    <input type="number" step="0.05" id="il-hr-lat" class="w-full mt-1" value="${global.latentHeatRecoveryEffectiveness || 0.65}">
                </div>
            </div>

            <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                <button class="btn btn-sm btn-primary" id="il-global-save">Save Global Defaults</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    container.querySelector('#il-global-save').addEventListener('click', () => {
        const newGlobal = {
            availabilitySchedule: container.querySelector('#il-avail').value,

            maxHeatingSupplyAirTemperature: parseFloat(container.querySelector('#il-max-heat').value),
            maxHeatingSupplyAirHumidityRatio: parseFloat(container.querySelector('#il-max-heat-hum').value),
            heatingLimitType: container.querySelector('#il-heat-limit').value,
            maxHeatingAirFlowRate: parseAutosize(container.querySelector('#il-max-heat-flow').value),
            maxSensibleHeatingCapacity: parseAutosize(container.querySelector('#il-max-heat-cap').value),
            heatingAvailabilitySchedule: container.querySelector('#il-heat-avail').value,

            minCoolingSupplyAirTemperature: parseFloat(container.querySelector('#il-min-cool').value),
            minCoolingSupplyAirHumidityRatio: parseFloat(container.querySelector('#il-min-cool-hum').value),
            coolingLimitType: container.querySelector('#il-cool-limit').value,
            maxCoolingAirFlowRate: parseAutosize(container.querySelector('#il-max-cool-flow').value),
            maxTotalCoolingCapacity: parseAutosize(container.querySelector('#il-max-cool-cap').value),
            coolingAvailabilitySchedule: container.querySelector('#il-cool-avail').value,

            dehumidificationControlType: container.querySelector('#il-dehum-type').value,
            coolingSensibleHeatRatio: parseFloat(container.querySelector('#il-cool-shr').value),
            dehumidificationSetpoint: parseFloat(container.querySelector('#il-dehum-setpoint').value),
            humidificationControlType: container.querySelector('#il-hum-type').value,
            humidificationSetpoint: parseFloat(container.querySelector('#il-hum-setpoint').value),

            outdoorAirMethod: container.querySelector('#il-oa-method').value,
            outdoorAirFlowRatePerPerson: parseFloat(container.querySelector('#il-oa-person').value),
            outdoorAirFlowRatePerZoneFloorArea: parseFloat(container.querySelector('#il-oa-area').value),
            outdoorAirFlowRatePerZone: parseFloat(container.querySelector('#il-oa-zone').value),
            designSpecificationOutdoorAirObjectName: container.querySelector('#il-oa-obj').value,
            demandControlledVentilationType: container.querySelector('#il-dcv-type').value,
            outdoorAirEconomizerType: container.querySelector('#il-econ-type').value,
            heatRecoveryType: container.querySelector('#il-hr-type').value,
            sensibleHeatRecoveryEffectiveness: parseFloat(container.querySelector('#il-hr-sens').value),
            latentHeatRecoveryEffectiveness: parseFloat(container.querySelector('#il-hr-lat').value),
        };

        const { config } = getConfig(project);
        setThermostatsAndIdealLoads(project, config.thermostats, { ...config.idealLoads, global: newGlobal });
        alert('Global Ideal Loads defaults saved.');
    });
}

function renderIdealLoadsZone(panel, zoneName) {
    const container = panel.querySelector('#tstat-editor');
    const { config } = getConfig(project);
    const perZone = config.idealLoads?.perZone || [];
    const zoneData = perZone.find(z => z.zoneName === zoneName) || {};
    const schedNames = getScheduleNames();

    const renderLabel = (text, key) => {
        const tooltip = TOOLTIPS[key];
        const infoIcon = tooltip ? `
            <span class="info-icon">i
                <span class="info-popover">${tooltip}</span>
            </span>
        ` : '';
        return `<label class="label">${text}${infoIcon}</label>`;
    };

    const limitOpts = (sel) => `
        <option value="">(inherit/global)</option>
        <option value="NoLimit" ${sel === 'NoLimit' ? 'selected' : ''}>NoLimit</option>
        <option value="LimitFlowRate" ${sel === 'LimitFlowRate' ? 'selected' : ''}>LimitFlowRate</option>
        <option value="LimitCapacity" ${sel === 'LimitCapacity' ? 'selected' : ''}>LimitCapacity</option>
        <option value="LimitFlowRateAndCapacity" ${sel === 'LimitFlowRateAndCapacity' ? 'selected' : ''}>LimitFlowRateAndCapacity</option>
    `;

    const schedOpts = (sel) => {
        let html = '<option value="">(inherit/global)</option>';
        schedNames.forEach(n => html += `<option value="${n}" ${n === sel ? 'selected' : ''}>${n}</option>`);
        return html;
    };

    const oaMethodOpts = (sel) => `
        <option value="">(inherit/global)</option>
        <option value="None" ${sel === 'None' ? 'selected' : ''}>None</option>
        <option value="Flow/Zone" ${sel === 'Flow/Zone' ? 'selected' : ''}>Flow/Zone</option>
        <option value="Flow/Person" ${sel === 'Flow/Person' ? 'selected' : ''}>Flow/Person</option>
        <option value="Flow/Area" ${sel === 'Flow/Area' ? 'selected' : ''}>Flow/Area</option>
        <option value="Sum" ${sel === 'Sum' ? 'selected' : ''}>Sum</option>
        <option value="Maximum" ${sel === 'Maximum' ? 'selected' : ''}>Maximum</option>
        <option value="DetailedSpecification" ${sel === 'DetailedSpecification' ? 'selected' : ''}>DetailedSpecification</option>
    `;

    const dcvOpts = (sel) => `
        <option value="">(inherit/global)</option>
        <option value="None" ${sel === 'None' ? 'selected' : ''}>None</option>
        <option value="OccupancySchedule" ${sel === 'OccupancySchedule' ? 'selected' : ''}>OccupancySchedule</option>
        <option value="CO2Setpoint" ${sel === 'CO2Setpoint' ? 'selected' : ''}>CO2Setpoint</option>
    `;

    const econOpts = (sel) => `
        <option value="">(inherit/global)</option>
        <option value="NoEconomizer" ${sel === 'NoEconomizer' ? 'selected' : ''}>NoEconomizer</option>
        <option value="DifferentialDryBulb" ${sel === 'DifferentialDryBulb' ? 'selected' : ''}>DifferentialDryBulb</option>
        <option value="DifferentialEnthalpy" ${sel === 'DifferentialEnthalpy' ? 'selected' : ''}>DifferentialEnthalpy</option>
    `;

    const heatRecOpts = (sel) => `
        <option value="">(inherit/global)</option>
        <option value="None" ${sel === 'None' ? 'selected' : ''}>None</option>
        <option value="Sensible" ${sel === 'Sensible' ? 'selected' : ''}>Sensible</option>
        <option value="Enthalpy" ${sel === 'Enthalpy' ? 'selected' : ''}>Enthalpy</option>
    `;

    const dehumidOpts = (sel) => `
        <option value="">(inherit/global)</option>
        <option value="ConstantSensibleHeatRatio" ${sel === 'ConstantSensibleHeatRatio' ? 'selected' : ''}>ConstantSensibleHeatRatio</option>
        <option value="Humidistat" ${sel === 'Humidistat' ? 'selected' : ''}>Humidistat</option>
        <option value="None" ${sel === 'None' ? 'selected' : ''}>None</option>
        <option value="ConstantSupplyHumidityRatio" ${sel === 'ConstantSupplyHumidityRatio' ? 'selected' : ''}>ConstantSupplyHumidityRatio</option>
    `;

    const humidOpts = (sel) => `
        <option value="">(inherit/global)</option>
        <option value="None" ${sel === 'None' ? 'selected' : ''}>None</option>
        <option value="Humidistat" ${sel === 'Humidistat' ? 'selected' : ''}>Humidistat</option>
        <option value="ConstantSupplyHumidityRatio" ${sel === 'ConstantSupplyHumidityRatio' ? 'selected' : ''}>ConstantSupplyHumidityRatio</option>
    `;

    const formatAutosize = (val) => val === 'Autosize' ? 'Autosize' : (val !== undefined ? val : '');
    const parseAutosize = (val) => {
        const v = val.trim();
        if (v.toLowerCase() === 'autosize') return 'Autosize';
        if (v === '') return undefined;
        const n = parseFloat(v);
        return isNaN(n) ? undefined : n;
    };

    let html = `
        <div class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Ideal Loads: ${zoneName}</h3>
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    ${renderLabel('Availability Schedule', 'availabilitySchedule')}
                    <select id="il-avail" class="w-full mt-1">${schedOpts(zoneData.availabilitySchedule)}</select>
                </div>
                <div>
                    ${renderLabel('Template Thermostat', 'templateThermostatName')}
                    <input type="text" id="il-tstat-name" class="w-full mt-1" value="${zoneData.templateThermostatName || ''}" placeholder="(inherit/none)">
                </div>
            </div>

            <!-- Heating Settings -->
            <div class="border-t border-[--grid-color] pt-2 mt-2"><span class="text-xs font-bold text-[--text-secondary]">Heating</span></div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    ${renderLabel('Max Heating Supply Temp [°C]', 'maxHeatingSupplyAirTemperature')}
                    <input type="number" id="il-max-heat" class="w-full mt-1" value="${zoneData.maxHeatingSupplyAirTemperature || ''}" placeholder="(global)">
                </div>
                <div>
                    ${renderLabel('Max Heating Humidity Ratio', 'maxHeatingSupplyAirHumidityRatio')}
                    <input type="number" step="0.0001" id="il-max-heat-hum" class="w-full mt-1" value="${zoneData.maxHeatingSupplyAirHumidityRatio || ''}" placeholder="(global)">
                </div>
                <div>
                    ${renderLabel('Heating Limit Override', 'heatingLimitType')}
                    <select id="il-heat-limit" class="w-full mt-1">${limitOpts(zoneData.heatingLimitType)}</select>
                </div>
                <div>
                    ${renderLabel('Max Heating Air Flow [m³/s]', 'maxHeatingAirFlowRate')}
                    <input type="text" id="il-max-heat-flow" class="w-full mt-1" value="${formatAutosize(zoneData.maxHeatingAirFlowRate)}" placeholder="(global)">
                </div>
                <div>
                    ${renderLabel('Max Sensible Heating Cap [W]', 'maxSensibleHeatingCapacity')}
                    <input type="text" id="il-max-heat-cap" class="w-full mt-1" value="${formatAutosize(zoneData.maxSensibleHeatingCapacity)}" placeholder="(global)">
                </div>
                <div>
                    ${renderLabel('Heating Availability Sched', 'heatingAvailabilitySchedule')}
                    <select id="il-heat-avail" class="w-full mt-1">${schedOpts(zoneData.heatingAvailabilitySchedule)}</select>
                </div>
            </div>

            <!-- Cooling Settings -->
            <div class="border-t border-[--grid-color] pt-2 mt-2"><span class="text-xs font-bold text-[--text-secondary]">Cooling</span></div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    ${renderLabel('Min Cooling Supply Temp [°C]', 'minCoolingSupplyAirTemperature')}
                    <input type="number" id="il-min-cool" class="w-full mt-1" value="${zoneData.minCoolingSupplyAirTemperature || ''}" placeholder="(global)">
                </div>
                <div>
                    ${renderLabel('Min Cooling Humidity Ratio', 'minCoolingSupplyAirHumidityRatio')}
                    <input type="number" step="0.0001" id="il-min-cool-hum" class="w-full mt-1" value="${zoneData.minCoolingSupplyAirHumidityRatio || ''}" placeholder="(global)">
                </div>
                <div>
                    ${renderLabel('Cooling Limit Override', 'coolingLimitType')}
                    <select id="il-cool-limit" class="w-full mt-1">${limitOpts(zoneData.coolingLimitType)}</select>
                </div>
                <div>
                    ${renderLabel('Max Cooling Air Flow [m³/s]', 'maxCoolingAirFlowRate')}
                    <input type="text" id="il-max-cool-flow" class="w-full mt-1" value="${formatAutosize(zoneData.maxCoolingAirFlowRate)}" placeholder="(global)">
                </div>
                <div>
                    ${renderLabel('Max Total Cooling Cap [W]', 'maxTotalCoolingCapacity')}
                    <input type="text" id="il-max-cool-cap" class="w-full mt-1" value="${formatAutosize(zoneData.maxTotalCoolingCapacity)}" placeholder="(global)">
                </div>
                <div>
                    ${renderLabel('Cooling Availability Sched', 'coolingAvailabilitySchedule')}
                    <select id="il-cool-avail" class="w-full mt-1">${schedOpts(zoneData.coolingAvailabilitySchedule)}</select>
                </div>
            </div>

            <!-- Humidity Control -->
            <div class="border-t border-[--grid-color] pt-2 mt-2"><span class="text-xs font-bold text-[--text-secondary]">Humidity Control</span></div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    ${renderLabel('Dehumidification Control', 'dehumidificationControlType')}
                    <select id="il-dehum-type" class="w-full mt-1">${dehumidOpts(zoneData.dehumidificationControlType)}</select>
                </div>
                <div>
                    ${renderLabel('Cooling Sensible Heat Ratio', 'coolingSensibleHeatRatio')}
                    <input type="number" step="0.01" id="il-cool-shr" class="w-full mt-1" value="${zoneData.coolingSensibleHeatRatio || ''}" placeholder="(global)">
                </div>
                <div>
                    ${renderLabel('Dehumidification Setpoint', 'dehumidificationSetpoint')}
                    <input type="number" step="0.0001" id="il-dehum-setpoint" class="w-full mt-1" value="${zoneData.dehumidificationSetpoint || ''}" placeholder="(global)">
                </div>
                <div>
                    ${renderLabel('Humidification Control', 'humidificationControlType')}
                    <select id="il-hum-type" class="w-full mt-1">${humidOpts(zoneData.humidificationControlType)}</select>
                </div>
                <div>
                    ${renderLabel('Humidification Setpoint', 'humidificationSetpoint')}
                    <input type="number" step="0.0001" id="il-hum-setpoint" class="w-full mt-1" value="${zoneData.humidificationSetpoint || ''}" placeholder="(global)">
                </div>
            </div>

            <!-- Outdoor Air -->
            <div class="border-t border-[--grid-color] pt-2 mt-2"><span class="text-xs font-bold text-[--text-secondary]">Outdoor Air</span></div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    ${renderLabel('Outdoor Air Method', 'outdoorAirMethod')}
                    <select id="il-oa-method" class="w-full mt-1">${oaMethodOpts(zoneData.outdoorAirMethod)}</select>
                </div>
                <div>
                    ${renderLabel('Flow per Person [m³/s]', 'outdoorAirFlowRatePerPerson')}
                    <input type="number" step="0.001" id="il-oa-person" class="w-full mt-1" value="${zoneData.outdoorAirFlowRatePerPerson !== undefined ? zoneData.outdoorAirFlowRatePerPerson : ''}" placeholder="(global)">
                </div>
                <div>
                    ${renderLabel('Flow per Area [m³/s-m²]', 'outdoorAirFlowRatePerZoneFloorArea')}
                    <input type="number" step="0.001" id="il-oa-area" class="w-full mt-1" value="${zoneData.outdoorAirFlowRatePerZoneFloorArea !== undefined ? zoneData.outdoorAirFlowRatePerZoneFloorArea : ''}" placeholder="(global)">
                </div>
                <div>
                    ${renderLabel('Flow per Zone [m³/s]', 'outdoorAirFlowRatePerZone')}
                    <input type="number" step="0.01" id="il-oa-zone" class="w-full mt-1" value="${zoneData.outdoorAirFlowRatePerZone !== undefined ? zoneData.outdoorAirFlowRatePerZone : ''}" placeholder="(global)">
                </div>
                <div>
                    ${renderLabel('Design Spec OA Object', 'designSpecificationOutdoorAirObjectName')}
                    <input type="text" id="il-oa-obj" class="w-full mt-1" value="${zoneData.designSpecificationOutdoorAirObjectName || ''}" placeholder="(global)">
                </div>
                <div>
                    ${renderLabel('Demand Controlled Vent', 'demandControlledVentilationType')}
                    <select id="il-dcv-type" class="w-full mt-1">${dcvOpts(zoneData.demandControlledVentilationType)}</select>
                </div>
                <div>
                    ${renderLabel('Economizer Type', 'outdoorAirEconomizerType')}
                    <select id="il-econ-type" class="w-full mt-1">${econOpts(zoneData.outdoorAirEconomizerType)}</select>
                </div>
                <div>
                    ${renderLabel('Heat Recovery Type', 'heatRecoveryType')}
                    <select id="il-hr-type" class="w-full mt-1">${heatRecOpts(zoneData.heatRecoveryType)}</select>
                </div>
                <div>
                    ${renderLabel('Sensible Heat Recovery Eff', 'sensibleHeatRecoveryEffectiveness')}
                    <input type="number" step="0.05" id="il-hr-sens" class="w-full mt-1" value="${zoneData.sensibleHeatRecoveryEffectiveness !== undefined ? zoneData.sensibleHeatRecoveryEffectiveness : ''}" placeholder="(global)">
                </div>
                <div>
                    ${renderLabel('Latent Heat Recovery Eff', 'latentHeatRecoveryEffectiveness')}
                    <input type="number" step="0.05" id="il-hr-lat" class="w-full mt-1" value="${zoneData.latentHeatRecoveryEffectiveness !== undefined ? zoneData.latentHeatRecoveryEffectiveness : ''}" placeholder="(global)">
                </div>
            </div>

            <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                <button class="btn btn-sm btn-primary" id="il-zone-save">Save Override</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    container.querySelector('#il-zone-save').addEventListener('click', () => {
        const newData = {
            zoneName,
            availabilitySchedule: container.querySelector('#il-avail').value,
            templateThermostatName: container.querySelector('#il-tstat-name').value,

            maxHeatingSupplyAirTemperature: parseFloat(container.querySelector('#il-max-heat').value) || undefined,
            maxHeatingSupplyAirHumidityRatio: parseFloat(container.querySelector('#il-max-heat-hum').value) || undefined,
            heatingLimitType: container.querySelector('#il-heat-limit').value,
            maxHeatingAirFlowRate: parseAutosize(container.querySelector('#il-max-heat-flow').value),
            maxSensibleHeatingCapacity: parseAutosize(container.querySelector('#il-max-heat-cap').value),
            heatingAvailabilitySchedule: container.querySelector('#il-heat-avail').value,

            minCoolingSupplyAirTemperature: parseFloat(container.querySelector('#il-min-cool').value) || undefined,
            minCoolingSupplyAirHumidityRatio: parseFloat(container.querySelector('#il-min-cool-hum').value) || undefined,
            coolingLimitType: container.querySelector('#il-cool-limit').value,
            maxCoolingAirFlowRate: parseAutosize(container.querySelector('#il-max-cool-flow').value),
            maxTotalCoolingCapacity: parseAutosize(container.querySelector('#il-max-cool-cap').value),
            coolingAvailabilitySchedule: container.querySelector('#il-cool-avail').value,

            dehumidificationControlType: container.querySelector('#il-dehum-type').value,
            coolingSensibleHeatRatio: parseFloat(container.querySelector('#il-cool-shr').value) || undefined,
            dehumidificationSetpoint: parseFloat(container.querySelector('#il-dehum-setpoint').value) || undefined,
            humidificationControlType: container.querySelector('#il-hum-type').value,
            humidificationSetpoint: parseFloat(container.querySelector('#il-hum-setpoint').value) || undefined,

            outdoorAirMethod: container.querySelector('#il-oa-method').value,
            outdoorAirFlowRatePerPerson: container.querySelector('#il-oa-person').value ? parseFloat(container.querySelector('#il-oa-person').value) : undefined,
            outdoorAirFlowRatePerZoneFloorArea: container.querySelector('#il-oa-area').value ? parseFloat(container.querySelector('#il-oa-area').value) : undefined,
            outdoorAirFlowRatePerZone: container.querySelector('#il-oa-zone').value ? parseFloat(container.querySelector('#il-oa-zone').value) : undefined,
            designSpecificationOutdoorAirObjectName: container.querySelector('#il-oa-obj').value,
            demandControlledVentilationType: container.querySelector('#il-dcv-type').value,
            outdoorAirEconomizerType: container.querySelector('#il-econ-type').value,
            heatRecoveryType: container.querySelector('#il-hr-type').value,
            sensibleHeatRecoveryEffectiveness: container.querySelector('#il-hr-sens').value ? parseFloat(container.querySelector('#il-hr-sens').value) : undefined,
            latentHeatRecoveryEffectiveness: container.querySelector('#il-hr-lat').value ? parseFloat(container.querySelector('#il-hr-lat').value) : undefined,
        };

        let newPerZone = [...perZone];
        // Remove existing
        newPerZone = newPerZone.filter(z => z.zoneName !== zoneName);
        // Add new if it has any data (simple check, could be more robust)
        newPerZone.push(newData);

        const newIdealLoads = { ...config.idealLoads, perZone: newPerZone };
        setThermostatsAndIdealLoads(project, config.thermostats, newIdealLoads);
        alert(`Ideal Loads settings for ${zoneName} saved.`);
    });
}

// ==========================================
// HVAC SIZING EDITORS
// ==========================================

function renderSizingView(panel, sizingType) {
    const container = panel.querySelector('#tstat-editor');
    const { config } = getConfig(project);
    const sizing = config.sizing || {};

    container.innerHTML = '';

    if (sizingType === 'global-sizing') {
        renderGlobalSizing(container, sizing.parameters, project);
        return;
    }

    let items = [];
    let title = '';
    let renderDetailFn = null;
    let onAdd = null;
    let onDelete = null;
    let onSave = null;

    if (sizingType === 'zone-sizing') {
        title = 'Zone Sizing';
        const zones = getZones();
        const sizingZones = sizing.zones || [];
        items = zones.map(z => {
            const sz = sizingZones.find(x => x.zoneName === z.name) || {};
            return { ...sz, zoneName: z.name, _displayName: z.name };
        });
        renderDetailFn = (item, contentDiv) => renderZoneSizingDetail(item, contentDiv, config);
        onSave = (item) => {
            const newZones = [...(config.sizing?.zones || [])];
            const idx = newZones.findIndex(z => z.zoneName === item.zoneName);
            if (idx >= 0) newZones[idx] = item;
            else newZones.push(item);
            setSizingZones(project, newZones);
        };
    } else if (sizingType === 'system-sizing') {
        title = 'System Sizing';
        items = (sizing.systems || []).map(s => ({ ...s, _displayName: s.airLoopName || 'Unnamed System' }));
        renderDetailFn = (item, contentDiv) => renderSystemSizingDetail(item, contentDiv, config);
        onAdd = () => {
            const newItem = { airLoopName: 'New System', typeOfLoadToSizeOn: 'Sensible' };
            const newSystems = [...(sizing.systems || []), newItem];
            setSizingSystems(project, newSystems);
            return newItem;
        };
        onDelete = (item) => {
            if (!confirm(`Delete system ${item.airLoopName}?`)) return;
            const newSystems = (config.sizing?.systems || []).filter(s => s.airLoopName !== item.airLoopName);
            setSizingSystems(project, newSystems);
        };
        onSave = (item, originalItem) => {
            const newSystems = [...(config.sizing?.systems || [])];
            const searchName = originalItem ? originalItem.airLoopName : item.airLoopName;
            const idx = newSystems.findIndex(s => s.airLoopName === searchName);
            if (idx >= 0) newSystems[idx] = item;
            else newSystems.push(item);
            setSizingSystems(project, newSystems);
        };
    } else if (sizingType === 'plant-sizing') {
        title = 'Plant Sizing';
        items = (sizing.plants || []).map(p => ({ ...p, _displayName: p.plantLoopName || 'Unnamed Plant' }));
        renderDetailFn = (item, contentDiv) => renderPlantSizingDetail(item, contentDiv, config);
        onAdd = () => {
            const newItem = { plantLoopName: 'New Plant', loopType: 'Heating' };
            const newPlants = [...(sizing.plants || []), newItem];
            setSizingPlants(project, newPlants);
            return newItem;
        };
        onDelete = (item) => {
            if (!confirm(`Delete plant ${item.plantLoopName}?`)) return;
            const newPlants = (config.sizing?.plants || []).filter(p => p.plantLoopName !== item.plantLoopName);
            setSizingPlants(project, newPlants);
        };
        onSave = (item, originalItem) => {
            const newPlants = [...(config.sizing?.plants || [])];
            const searchName = originalItem ? originalItem.plantLoopName : item.plantLoopName;
            const idx = newPlants.findIndex(p => p.plantLoopName === searchName);
            if (idx >= 0) newPlants[idx] = item;
            else newPlants.push(item);
            setSizingPlants(project, newPlants);
        };
    }

    renderMasterDetail(container, title, items, renderDetailFn, onAdd, onDelete, onSave);
}

function renderGlobalSizing(container, params = {}, project) {
    const renderLabel = (text, key) => {
        const tooltip = TOOLTIPS[key];
        const infoIcon = tooltip ? `
            <span class="info-icon">i
                <span class="info-popover">${tooltip}</span>
            </span>
        ` : '';
        return `<label class="label">${text}${infoIcon}</label>`;
    };

    const html = `
        <div class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Global Sizing Parameters</h3>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    ${renderLabel('Heating Sizing Factor', 'zoneHeatingSizingFactor')}
                    <input type="number" step="0.01" id="gs-heat-factor" class="w-full mt-1" value="${params.heatingSizingFactor || 1.25}">
                </div>
                <div>
                    ${renderLabel('Cooling Sizing Factor', 'zoneCoolingSizingFactor')}
                    <input type="number" step="0.01" id="gs-cool-factor" class="w-full mt-1" value="${params.coolingSizingFactor || 1.15}">
                </div>
                <div>
                    ${renderLabel('Timesteps in Averaging Window', 'zoneTimestepsInAveragingWindow')}
                    <input type="number" id="gs-timesteps" class="w-full mt-1" value="${params.timestepsInAveragingWindow || ''}" placeholder="(default)">
                </div>
            </div>
            <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                <button class="btn btn-sm btn-primary" id="save-global-sizing">Save Global Sizing</button>
            </div>
        </div>
    `;
    container.innerHTML = html;

    container.querySelector('#save-global-sizing').addEventListener('click', () => {
        const newParams = {
            heatingSizingFactor: parseFloat(container.querySelector('#gs-heat-factor').value),
            coolingSizingFactor: parseFloat(container.querySelector('#gs-cool-factor').value),
            timestepsInAveragingWindow: container.querySelector('#gs-timesteps').value ? parseInt(container.querySelector('#gs-timesteps').value) : undefined
        };
        setSizingParameters(project, newParams);
        alert('Global sizing parameters saved.');
    });
}

function renderMasterDetail(container, title, items, renderDetailFn, onAdd, onDelete, onSave) {
    // Layout: Left sidebar (list), Right content (detail)
    container.innerHTML = `
        <div class="flex h-full gap-4">
            <div class="w-1/3 flex flex-col border-r border-[--grid-color] pr-2">
                <div class="flex justify-between items-center mb-2">
                    <h3 class="font-semibold text-sm uppercase">${title}</h3>
                    ${onAdd ? '<button class="btn btn-xs btn-secondary" id="md-add-btn">+</button>' : ''}
                </div>
                <div class="flex-1 overflow-y-auto space-y-1" id="md-list">
                    <!-- List items injected here -->
                </div>
            </div>
            <div class="w-2/3 flex flex-col pl-2 overflow-y-auto" id="md-detail">
                <div class="text-gray-500 italic mt-10 text-center">Select an item to edit</div>
            </div>
        </div>
    `;

    const listContainer = container.querySelector('#md-list');
    const detailContainer = container.querySelector('#md-detail');
    let selectedItem = null;

    const renderList = () => {
        listContainer.innerHTML = '';
        items.forEach((item, idx) => {
            const div = document.createElement('div');
            div.className = `p-2 rounded cursor-pointer text-xs flex justify-between items-center hover:bg-white/5 ${selectedItem === item ? 'bg-[--accent-color] text-black font-semibold' : 'bg-black/20'}`;
            div.innerHTML = `<span>${item._displayName}</span>`;
            div.onclick = () => selectItem(item);
            listContainer.appendChild(div);
        });
    };

    const selectItem = (item) => {
        selectedItem = item;
        renderList();
        renderDetail(item);
    };

    const renderDetail = (item) => {
        detailContainer.innerHTML = '';
        const contentDiv = document.createElement('div');
        contentDiv.className = 'space-y-4';

        // Render specific form
        renderDetailFn(item, contentDiv);

        // Add Save/Delete buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'flex justify-between mt-6 pt-4 border-t border-[--grid-color]';
        actionsDiv.innerHTML = `
            ${onDelete ? '<button class="btn btn-sm btn-danger" id="md-delete-btn">Delete</button>' : '<div></div>'}
            <button class="btn btn-sm btn-primary" id="md-save-btn">Save</button>
        `;

        contentDiv.appendChild(actionsDiv);
        detailContainer.appendChild(contentDiv);

        if (onDelete) {
            actionsDiv.querySelector('#md-delete-btn').addEventListener('click', () => {
                onDelete(item);
                // Refresh list (re-render parent view)
                // We can't easily re-render parent view from here without passing it down.
                // For now, let's assume onDelete updates state and we just need to refresh UI.
                // A simple hack is to re-click the sidebar button or re-call renderSizingView.
                // But we are inside renderSizingView context. 
                // We can update 'items' and re-render list.
                items = items.filter(i => i !== item);
                selectedItem = null;
                renderList();
                detailContainer.innerHTML = '<div class="text-gray-500 italic mt-10 text-center">Select an item to edit</div>';
            });
        }

        actionsDiv.querySelector('#md-save-btn').addEventListener('click', () => {
            // We need to capture the new data from the form.
            // The renderDetailFn should probably return a function to get data, or update 'item' in place?
            // Better: renderDetailFn takes 'item' and populates inputs. We need to scrape inputs.
            // Let's make renderDetailFn return a "getData" function or attach it to contentDiv.
            // Or simpler: pass 'item' to renderDetailFn, and renderDetailFn updates 'item' object directly on input change?
            // No, better to scrape on save.
            // Let's assume renderDetailFn adds a 'getData' method to contentDiv.
            if (contentDiv.getData) {
                const newData = contentDiv.getData();
                const merged = { ...item, ...newData };
                onSave(merged, item);
                // Update list item display name if changed
                if (merged.airLoopName) merged._displayName = merged.airLoopName;
                if (merged.plantLoopName) merged._displayName = merged.plantLoopName;

                // Update local items array
                const idx = items.indexOf(item);
                if (idx >= 0) items[idx] = merged;

                selectedItem = merged;
                renderList();
                alert('Saved.');
            }
        });
    };

    if (onAdd) {
        container.querySelector('#md-add-btn').addEventListener('click', () => {
            const newItem = onAdd();
            newItem._displayName = newItem.airLoopName || newItem.plantLoopName || 'New Item';
            items.push(newItem);
            selectItem(newItem);
        });
    }

    renderList();
    if (items.length > 0) selectItem(items[0]);
}

function renderZoneSizingDetail(data, container, config) {
    const outdoorAir = config.outdoorAir || {};
    const dsoaNames = Array.isArray(outdoorAir.designSpecs) ? outdoorAir.designSpecs.map(d => d.name) : [];
    const schedNames = getScheduleNames();

    const methodOpts = (sel, opts) => opts.map(o => `<option value="${o}" ${sel === o ? 'selected' : ''}>${o}</option>`).join('');

    const tempInputMethods = ['SupplyAirTemperature', 'TemperatureDifference'];
    const flowMethods = ['Flow/Zone', 'DesignDay', 'DesignDayWithLimit'];
    const loadMethods = ['Sensible Load', 'Latent Load', 'Sensible And Latent Load', 'Sensible Load Only No Latent Load'];
    const humMethods = ['SupplyAirHumidityRatio', 'HumidityRatioDifference'];
    const doasStrategies = ['NeutralSupplyAir', 'NeutralDehumidifiedSupplyAir', 'ColdSupplyAir'];
    const spaceSumTypes = ['Coincident', 'Noncoincident'];

    // Helper for inputs
    const inp = (label, key, type = 'number', placeholder = '', step = 'any', options = null) => {
        const val = data[key] !== undefined ? data[key] : '';
        const tooltip = TOOLTIPS[key];
        const infoIcon = tooltip ? `
            <span class="info-icon">i
                <span class="info-popover">${tooltip}</span>
            </span>
        ` : '';

        let inputHtml = '';
        if (options) {
            inputHtml = `<select class="w-full mt-1 bg-black/20 border border-gray-600 rounded px-2 py-1" data-key="${key}">
                <option value="">(default/none)</option>
                ${methodOpts(val, options)}
            </select>`;
        } else {
            inputHtml = `<input type="${type}" step="${step}" class="w-full mt-1 bg-black/20 border border-gray-600 rounded px-2 py-1" data-key="${key}" value="${val}" placeholder="${placeholder}">`;
        }

        return `
            <div>
                <label class="label text-[10px] uppercase tracking-wider text-gray-400" title="${label}">${label}${infoIcon}</label>
                ${inputHtml}
            </div>
        `;
    };

    const section = (title, content) => `
        <div class="bg-white/5 p-3 rounded border border-white/10">
            <h4 class="font-semibold text-xs uppercase text-[--accent-color] mb-3 border-b border-white/10 pb-1">${title}</h4>
            <div class="grid grid-cols-2 gap-4">
                ${content}
            </div>
        </div>
    `;

    container.innerHTML = `
        <div class="space-y-4 pr-2">
            <div class="flex justify-between items-center">
                <h2 class="text-lg font-bold">${data.zoneName}</h2>
                <span class="text-xs text-gray-400">Sizing:Zone</span>
            </div>

            ${section('General & Sizing Factors', `
                ${inp('Heating Sizing Factor', 'zoneHeatingSizingFactor', 'number', 'Global')}
                ${inp('Cooling Sizing Factor', 'zoneCoolingSizingFactor', 'number', 'Global')}
                ${inp('Account for DOAS', 'accountForDedicatedOutdoorAirSystem', 'text', 'No', null, ['Yes', 'No'])}
                ${inp('Space Sum Type', 'typeOfSpaceSumToUse', 'text', 'Coincident', null, spaceSumTypes)}
            `)}

            ${section('Cooling Design', `
                ${inp('Supply Air Temp Input Method', 'zoneCoolingDesignSupplyAirTemperatureInputMethod', 'text', '', null, tempInputMethods)}
                ${inp('Supply Air Temp [°C]', 'zoneCoolingDesignSupplyAirTemperature')}
                ${inp('Supply Air Temp Diff [°C]', 'zoneCoolingDesignSupplyAirTemperatureDifference')}
                ${inp('Supply Air Humidity Ratio', 'zoneCoolingDesignSupplyAirHumidityRatio', 'number', '0.008', '0.0001')}
                ${inp('Air Flow Method', 'coolingDesignAirFlowMethod', 'text', 'DesignDay', null, flowMethods)}
                ${inp('Air Flow Rate [m³/s]', 'coolingDesignAirFlowRate')}
                ${inp('Min Flow/Area [m³/s-m²]', 'coolingMinimumAirFlowPerZoneFloorArea', 'number', '0.000762', '0.000001')}
                ${inp('Min Flow [m³/s]', 'coolingMinimumAirFlow', 'number', '0.0')}
                ${inp('Min Flow Fraction', 'coolingMinimumAirFlowFraction', 'number', '0.2')}
            `)}

            ${section('Heating Design', `
                ${inp('Supply Air Temp Input Method', 'zoneHeatingDesignSupplyAirTemperatureInputMethod', 'text', '', null, tempInputMethods)}
                ${inp('Supply Air Temp [°C]', 'zoneHeatingDesignSupplyAirTemperature')}
                ${inp('Supply Air Temp Diff [°C]', 'zoneHeatingDesignSupplyAirTemperatureDifference')}
                ${inp('Supply Air Humidity Ratio', 'zoneHeatingDesignSupplyAirHumidityRatio', 'number', '0.008', '0.0001')}
                ${inp('Air Flow Method', 'heatingDesignAirFlowMethod', 'text', 'DesignDay', null, flowMethods)}
                ${inp('Air Flow Rate [m³/s]', 'heatingDesignAirFlowRate')}
                ${inp('Max Flow/Area [m³/s-m²]', 'heatingMaximumAirFlowPerZoneFloorArea', 'number', '0.002032', '0.000001')}
                ${inp('Max Flow [m³/s]', 'heatingMaximumAirFlow', 'number', '0.1415762')}
                ${inp('Max Flow Fraction', 'heatingMaximumAirFlowFraction', 'number', '0.3')}
            `)}

            ${section('Outdoor Air & DOAS', `
                ${inp('Design Spec Outdoor Air', 'designSpecOutdoorAirName', 'text', '(none)', null, dsoaNames)}
                ${inp('Design Spec Zone Air Dist', 'designSpecificationZoneAirDistributionObjectName', 'text', '(none)')} 
                ${inp('DOAS Control Strategy', 'dedicatedOutdoorAirSystemControlStrategy', 'text', 'NeutralSupplyAir', null, doasStrategies)}
                ${inp('DOAS Low Temp Setpoint [°C]', 'dedicatedOutdoorAirLowTemperatureSetpointForDesign')}
                ${inp('DOAS High Temp Setpoint [°C]', 'dedicatedOutdoorAirHighTemperatureSetpointForDesign')}
            `)}

            ${section('Latent Sizing', `
                ${inp('Zone Load Sizing Method', 'zoneLoadSizingMethod', 'text', 'Sensible Load Only...', null, loadMethods)}
                ${inp('Latent Cool HumRat Method', 'zoneLatentCoolingDesignSupplyAirHumidityRatioInputMethod', 'text', 'HumidityRatioDifference', null, humMethods)}
                ${inp('Dehumid Design HumRat', 'zoneDehumidificationDesignSupplyAirHumidityRatio', 'number', '', '0.0001')}
                ${inp('Cool HumRat Diff', 'zoneCoolingDesignSupplyAirHumidityRatioDifference', 'number', '', '0.0001')}
                ${inp('Latent Heat HumRat Method', 'zoneLatentHeatingDesignSupplyAirHumidityRatioInputMethod', 'text', 'HumidityRatioDifference', null, humMethods)}
                ${inp('Humid Design HumRat', 'zoneHumidificationDesignSupplyAirHumidityRatio', 'number', '', '0.0001')}
                ${inp('Heat HumRat Diff', 'zoneHeatingDesignSupplyAirHumidityRatioDifference', 'number', '', '0.0001')}
                ${inp('Humidistat Dehumid Sched', 'zoneHumidistatDehumidificationSetPointScheduleName', 'text', '(none)', null, schedNames)}
                ${inp('Humidistat Humid Sched', 'zoneHumidistatHumidificationSetPointScheduleName', 'text', '(none)', null, schedNames)}
            `)}
        </div>
    `;

    // Implement getData
    container.getData = () => {
        const result = {};
        container.querySelectorAll('[data-key]').forEach(el => {
            const key = el.dataset.key;
            let val = el.value;
            if (el.type === 'number') {
                val = val === '' ? undefined : parseFloat(val);
            } else {
                val = val === '' ? undefined : val;
            }
            result[key] = val;
        });
        return result;
    };
}

function renderSystemSizingDetail(data, container, config) {
    const loadTypes = ['Sensible', 'Latent', 'Total', 'VentilationRequirement'];
    const zoneSumTypes = ['Coincident', 'Noncoincident'];
    const yesNo = ['Yes', 'No'];
    const coolFlowMethods = ['DesignDay', 'Flow/System', 'FlowPerFloorArea', 'FractionOfAutosizedCoolingAirflow', 'FlowPerCoolingCapacity'];
    const heatFlowMethods = ['DesignDay', 'Flow/System', 'FlowPerFloorArea', 'FractionOfAutosizedHeatingAirflow', 'FractionOfAutosizedCoolingAirflow', 'FlowPerHeatingCapacity'];
    const oaMethods = ['ZoneSum', 'Standard62.1VentilationRateProcedure', 'Standard62.1SimplifiedProcedure'];
    const capMethods = ['None', 'CoolingDesignCapacity', 'CapacityPerFloorArea', 'FractionOfAutosizedCoolingCapacity'];
    const heatCapMethods = ['None', 'HeatingDesignCapacity', 'CapacityPerFloorArea', 'FractionOfAutosizedHeatingCapacity'];
    const controlMethods = ['VAV', 'Bypass', 'VT', 'OnOff'];

    const methodOpts = (sel, opts) => opts.map(o => `<option value="${o}" ${sel === o ? 'selected' : ''}>${o}</option>`).join('');

    const inp = (label, key, type = 'number', placeholder = '', step = 'any', options = null) => {
        const val = data[key] !== undefined ? data[key] : '';
        const tooltip = TOOLTIPS[key];
        const infoIcon = tooltip ? `
            <span class="info-icon">i
                <span class="info-popover">${tooltip}</span>
            </span>
        ` : '';

        let inputHtml = '';
        if (options) {
            inputHtml = `<select class="w-full mt-1 bg-black/20 border border-gray-600 rounded px-2 py-1" data-key="${key}">
                <option value="">(default/none)</option>
                ${methodOpts(val, options)}
            </select>`;
        } else {
            inputHtml = `<input type="${type}" step="${step}" class="w-full mt-1 bg-black/20 border border-gray-600 rounded px-2 py-1" data-key="${key}" value="${val}" placeholder="${placeholder}">`;
        }
        return `
            <div>
                <label class="label text-[10px] uppercase tracking-wider text-gray-400" title="${label}">${label}${infoIcon}</label>
                ${inputHtml}
            </div>
        `;
    };

    const section = (title, content) => `
        <div class="bg-white/5 p-3 rounded border border-white/10">
            <h4 class="font-semibold text-xs uppercase text-[--accent-color] mb-3 border-b border-white/10 pb-1">${title}</h4>
            <div class="grid grid-cols-2 gap-4">
                ${content}
            </div>
        </div>
    `;

    container.innerHTML = `
        <div class="space-y-4 pr-2">
            <div class="flex justify-between items-center">
                <h2 class="text-lg font-bold">${data.airLoopName || 'New System'}</h2>
                <span class="text-xs text-gray-400">Sizing:System</span>
            </div>

            ${section('General', `
                ${inp('AirLoop Name', 'airLoopName', 'text')}
                ${inp('Load Type', 'typeOfLoadToSizeOn', 'text', 'Sensible', null, loadTypes)}
                ${inp('Design OA Flow [m³/s]', 'designOutdoorAirFlowRate', 'text', 'Autosize')}
                ${inp('Min Sys Flow Ratio', 'centralHeatingMaximumSystemAirFlowRatio', 'text', '0.5')}
                ${inp('Zone Sum Type', 'typeOfZoneSumToUse', 'text', 'Noncoincident', null, zoneSumTypes)}
                ${inp('Occupant Diversity', 'occupantDiversity', 'text', 'Autosize')}
            `)}

            ${section('Temperatures & Humidity', `
                ${inp('Preheat Design Temp [°C]', 'preheatDesignTemperature')}
                ${inp('Preheat Design HumRat', 'preheatDesignHumidityRatio', 'number', '0.008', '0.0001')}
                ${inp('Precool Design Temp [°C]', 'precoolDesignTemperature')}
                ${inp('Precool Design HumRat', 'precoolDesignHumidityRatio', 'number', '0.008', '0.0001')}
                ${inp('Central Cool SAT [°C]', 'centralCoolingDesignSupplyAirTemperature')}
                ${inp('Central Cool HumRat', 'centralCoolingDesignSupplyAirHumidityRatio', 'number', '0.008', '0.0001')}
                ${inp('Central Heat SAT [°C]', 'centralHeatingDesignSupplyAirTemperature')}
                ${inp('Central Heat HumRat', 'centralHeatingDesignSupplyAirHumidityRatio', 'number', '0.008', '0.0001')}
            `)}

            ${section('Cooling Sizing', `
                ${inp('Supply Air Flow Method', 'coolingSupplyAirFlowRateMethod', 'text', 'DesignDay', null, coolFlowMethods)}
                ${inp('Supply Air Flow Rate', 'coolingSupplyAirFlowRate', 'number', '0')}
                ${inp('Flow/Area [m³/s-m²]', 'coolingSupplyAirFlowRatePerFloorArea')}
                ${inp('Fraction of Autosized', 'coolingFractionOfAutosizedCoolingDesignSupplyAirFlowRate')}
                ${inp('Flow/Capacity [m³/s-W]', 'coolingSupplyAirFlowRatePerUnitCoolingCapacity')}
                ${inp('Capacity Method', 'coolingDesignCapacityMethod', 'text', 'CoolingDesignCapacity', null, capMethods)}
                ${inp('Design Capacity [W]', 'coolingDesignCapacity', 'text', 'Autosize')}
                ${inp('Capacity/Area [W/m²]', 'coolingDesignCapacityPerFloorArea')}
                ${inp('Fraction of Autosized Cap', 'fractionOfAutosizedCoolingDesignCapacity')}
                ${inp('100% OA in Cooling', 'allOutdoorAirInCooling', 'text', 'No', null, yesNo)}
                ${inp('Control Method', 'centralCoolingCapacityControlMethod', 'text', 'VAV', null, controlMethods)}
            `)}

            ${section('Heating Sizing', `
                ${inp('Supply Air Flow Method', 'heatingSupplyAirFlowRateMethod', 'text', 'DesignDay', null, heatFlowMethods)}
                ${inp('Supply Air Flow Rate', 'heatingSupplyAirFlowRate', 'number', '0')}
                ${inp('Flow/Area [m³/s-m²]', 'heatingSupplyAirFlowRatePerFloorArea')}
                ${inp('Frac of Autosized Heat', 'heatingFractionOfAutosizedHeatingSupplyAirFlowRate')}
                ${inp('Frac of Autosized Cool', 'heatingFractionOfAutosizedCoolingSupplyAirFlowRate')}
                ${inp('Flow/Capacity [m³/s-W]', 'heatingDesignSupplyAirFlowRatePerUnitHeatingCapacity')}
                ${inp('Capacity Method', 'heatingDesignCapacityMethod', 'text', 'HeatingDesignCapacity', null, heatCapMethods)}
                ${inp('Design Capacity [W]', 'heatingDesignCapacity', 'text', 'Autosize')}
                ${inp('Capacity/Area [W/m²]', 'heatingDesignCapacityPerFloorArea')}
                ${inp('Fraction of Autosized Cap', 'fractionOfAutosizedHeatingDesignCapacity')}
                ${inp('100% OA in Heating', 'allOutdoorAirInHeating', 'text', 'No', null, yesNo)}
            `)}

            ${section('Outdoor Air', `
                ${inp('System OA Method', 'systemOutdoorAirMethod', 'text', 'ZoneSum', null, oaMethods)}
                ${inp('Zone Max OA Fraction', 'zoneMaximumOutdoorAirFraction', 'number', '1.0')}
            `)}
        </div>
    `;

    container.getData = () => {
        const result = {};
        container.querySelectorAll('[data-key]').forEach(el => {
            const key = el.dataset.key;
            let val = el.value;
            if (el.type === 'number') {
                val = val === '' ? undefined : parseFloat(val);
            } else {
                val = val === '' ? undefined : val;
            }
            result[key] = val;
        });
        return result;
    };
}

function renderPlantSizingDetail(data, container, config) {
    const loopTypes = ['Heating', 'Steam', 'Cooling', 'Condenser'];
    const sizingOpts = ['NonCoincident', 'Coincident'];
    const coincModes = ['None', 'GlobalHeatingSizingFactor', 'GlobalCoolingSizingFactor', 'LoopComponentSizingFactor'];

    const methodOpts = (sel, opts) => opts.map(o => `<option value="${o}" ${sel === o ? 'selected' : ''}>${o}</option>`).join('');

    const inp = (label, key, type = 'number', placeholder = '', step = 'any', options = null) => {
        const val = data[key] !== undefined ? data[key] : '';
        const tooltip = TOOLTIPS[key];
        const infoIcon = tooltip ? `
            <span class="info-icon">i
                <span class="info-popover">${tooltip}</span>
            </span>
        ` : '';

        let inputHtml = '';
        if (options) {
            inputHtml = `<select class="w-full mt-1 bg-black/20 border border-gray-600 rounded px-2 py-1" data-key="${key}">
                <option value="">(default/none)</option>
                ${methodOpts(val, options)}
            </select>`;
        } else {
            inputHtml = `<input type="${type}" step="${step}" class="w-full mt-1 bg-black/20 border border-gray-600 rounded px-2 py-1" data-key="${key}" value="${val}" placeholder="${placeholder}">`;
        }
        return `
            <div>
                <label class="label text-[10px] uppercase tracking-wider text-gray-400" title="${label}">${label}${infoIcon}</label>
                ${inputHtml}
            </div>
        `;
    };

    const section = (title, content) => `
        <div class="bg-white/5 p-3 rounded border border-white/10">
            <h4 class="font-semibold text-xs uppercase text-[--accent-color] mb-3 border-b border-white/10 pb-1">${title}</h4>
            <div class="grid grid-cols-2 gap-4">
                ${content}
            </div>
        </div>
    `;

    container.innerHTML = `
        <div class="space-y-4 pr-2">
            <div class="flex justify-between items-center">
                <h2 class="text-lg font-bold">${data.plantLoopName || 'New Plant'}</h2>
                <span class="text-xs text-gray-400">Sizing:Plant</span>
            </div>

            ${section('General', `
                ${inp('Loop Name', 'plantLoopName', 'text')}
                ${inp('Loop Type', 'loopType', 'text', 'Heating', null, loopTypes)}
                ${inp('Exit Temp [°C]', 'designLoopExitTemperature')}
                ${inp('Delta T [°C]', 'loopDesignTemperatureDifference')}
            `)}

            ${section('Sizing Options', `
                ${inp('Sizing Option', 'sizingOption', 'text', 'NonCoincident', null, sizingOpts)}
                ${inp('Timesteps in Window', 'zoneTimestepsInAveragingWindow', 'number', '1')}
                ${inp('Coincident Factor Mode', 'coincidentSizingFactorMode', 'text', 'None', null, coincModes)}
            `)}
        </div>
    `;

    container.getData = () => {
        const result = {};
        container.querySelectorAll('[data-key]').forEach(el => {
            const key = el.dataset.key;
            let val = el.value;
            if (el.type === 'number') {
                val = val === '' ? undefined : parseFloat(val);
            } else {
                val = val === '' ? undefined : val;
            }
            result[key] = val;
        });
        return result;
    };
}
