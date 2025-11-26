import { getDom } from './dom.js';
import { project } from './project.js';
import {
    getConfig,
    setMaterials,
    setConstructions
} from './energyplusConfigService.js';

let dom;

export function openMaterialsManagerPanel() {
    dom = getDom();
    const panelId = 'panel-materials-constructions';
    const btnId = 'btn-open-materials-panel';
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
        panel = createMaterialsManagerPanel();
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

    // Default to Materials view if not set
    if (!panel.dataset.currentView) {
        panel.dataset.currentView = 'materials';
    }

    renderList(panel);
}

export function openConstructionsManagerPanel() {
    dom = getDom();
    const panelId = 'panel-materials-constructions';
    let panel = document.getElementById(panelId);
    if (!panel) {
        panel = createMaterialsManagerPanel();
        const container = document.getElementById('window-container');
        container.appendChild(panel);
    }
    panel.classList.remove('hidden');

    // Bring to front
    const allPanels = document.querySelectorAll('.floating-window');
    let maxZ = 100;
    allPanels.forEach(p => {
        const z = parseInt(window.getComputedStyle(p).zIndex) || 0;
        if (z > maxZ) maxZ = z;
    });
    panel.style.zIndex = maxZ + 1;

    // Set view to constructions
    panel.dataset.currentView = 'constructions';

    // Update toggle buttons visual state
    const matBtn = panel.querySelector('#view-materials-btn');
    const conBtn = panel.querySelector('#view-constructions-btn');
    if (matBtn && conBtn) {
        conBtn.classList.add('active');
        conBtn.style.backgroundColor = 'var(--accent-color)';
        matBtn.classList.remove('active');
        matBtn.style.backgroundColor = '';
        panel.querySelector('#list-title').textContent = 'Constructions';
    }

    renderList(panel);
}

function createMaterialsManagerPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-materials-constructions';
    panel.className = 'floating-window ui-panel resizable-panel';

    panel.style.width = '600px';
    panel.style.height = '500px';

    panel.innerHTML = `
        <div class="window-header">
            <span>Materials & Constructions</span>
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
                    <div style="padding: 0.5rem; border-bottom: 1px solid var(--grid-color);">
                        <div class="flex gap-1 mb-2">
                            <button class="btn btn-xs btn-secondary flex-1 active" id="view-materials-btn">Materials</button>
                            <button class="btn btn-xs btn-secondary flex-1" id="view-constructions-btn">Constructions</button>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="label" id="list-title">Materials</span>
                            <button class="btn btn-xs btn-secondary" id="add-item-btn" title="Add New">+</button>
                        </div>
                    </div>
                    <div id="mc-list" class="scrollable-panel-inner" style="flex: 1; overflow-y: auto;">
                        <!-- List items injected here -->
                    </div>
                </div>

                <!-- Right Content: Editor -->
                <div id="mc-editor" style="flex: 1; padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
                    <div class="text-[--text-secondary] text-sm text-center mt-10">Select an item to edit or create a new one.</div>
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

    // View Toggles
    const matBtn = panel.querySelector('#view-materials-btn');
    const conBtn = panel.querySelector('#view-constructions-btn');

    matBtn.addEventListener('click', () => {
        panel.dataset.currentView = 'materials';
        matBtn.classList.add('active'); // You might need CSS for .active or use style
        matBtn.style.backgroundColor = 'var(--accent-color)';
        conBtn.style.backgroundColor = '';
        panel.querySelector('#list-title').textContent = 'Materials';
        renderList(panel);
        panel.querySelector('#mc-editor').innerHTML = '<div class="text-[--text-secondary] text-sm text-center mt-10">Select a material to edit.</div>';
    });

    conBtn.addEventListener('click', () => {
        panel.dataset.currentView = 'constructions';
        conBtn.classList.add('active');
        conBtn.style.backgroundColor = 'var(--accent-color)';
        matBtn.style.backgroundColor = '';
        panel.querySelector('#list-title').textContent = 'Constructions';
        renderList(panel);
        panel.querySelector('#mc-editor').innerHTML = '<div class="text-[--text-secondary] text-sm text-center mt-10">Select a construction to edit.</div>';
    });

    // Initial style for active button
    matBtn.style.backgroundColor = 'var(--accent-color)';

    panel.querySelector('#add-item-btn').addEventListener('click', () => {
        const view = panel.dataset.currentView;
        renderEditor(panel, null, true, view);
    });

    return panel;
}

function renderList(panel) {
    const listContainer = panel.querySelector('#mc-list');
    const view = panel.dataset.currentView;
    const { config } = getConfig(project);

    listContainer.innerHTML = '';

    let items = [];
    if (view === 'materials') {
        items = config.materials || [];
    } else {
        items = config.constructions || [];
    }

    // "Project Defaults" item for Constructions view
    if (view === 'constructions') {
        const defaultItem = document.createElement('div');
        defaultItem.className = 'list-item special-item';
        // Match Project Setup styling exactly (no flex, no icons)
        defaultItem.style.cssText = 'padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--grid-color);';
        defaultItem.dataset.special = 'defaults';

        defaultItem.innerHTML = `<div class="text-xs font-semibold">Project Defaults</div>`;

        defaultItem.addEventListener('click', () => {
            // Reset all active states
            listContainer.querySelectorAll('.list-item').forEach(i => {
                i.style.backgroundColor = '';
                i.style.color = '';
                i.classList.remove('active');
            });

            defaultItem.classList.add('active');
            defaultItem.style.backgroundColor = 'var(--accent-color)';
            defaultItem.style.color = 'white';

            renderDefaultsEditor(panel.querySelector('#mc-editor'), panel);
        });

        defaultItem.addEventListener('mouseenter', () => {
            if (!defaultItem.classList.contains('active')) {
                defaultItem.style.backgroundColor = 'var(--hover-bg)';
            }
        });

        defaultItem.addEventListener('mouseleave', () => {
            if (!defaultItem.classList.contains('active')) {
                defaultItem.style.backgroundColor = '';
            }
        });

        listContainer.appendChild(defaultItem);
    }

    if (items.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'p-2 text-xs text-[--text-secondary]';
        emptyDiv.textContent = `No custom ${view} defined.`;
        listContainer.appendChild(emptyDiv);
    } else {
        items.forEach((item, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'list-item';
            itemDiv.dataset.index = index;
            // Match Project Setup styling exactly
            itemDiv.style.cssText = 'padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--grid-color);';

            // Check if default (for constructions)
            let isDefault = false;
            let defaultTag = '';
            if (view === 'constructions') {
                const d = config.defaults || {};
                isDefault = (d.wallConstruction === item.name || d.roofConstruction === item.name || d.floorConstruction === item.name || d.windowConstruction === item.name);
                if (isDefault) {
                    defaultTag = ' <span class="text-[--accent-color]">(def)</span>';
                }
            }

            itemDiv.innerHTML = `<div class="text-xs" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}${defaultTag}</div>`;

            itemDiv.addEventListener('click', () => {
                // Highlight selection
                listContainer.querySelectorAll('.list-item').forEach(i => {
                    i.style.backgroundColor = '';
                    i.style.color = '';
                    i.classList.remove('active');
                });

                itemDiv.classList.add('active');
                itemDiv.style.backgroundColor = 'var(--accent-color)';
                itemDiv.style.color = 'white';

                renderEditor(panel, items[index], false, view, index);
            });

            itemDiv.addEventListener('mouseenter', () => {
                if (!itemDiv.classList.contains('active')) {
                    itemDiv.style.backgroundColor = 'var(--hover-bg)';
                }
            });

            itemDiv.addEventListener('mouseleave', () => {
                if (!itemDiv.classList.contains('active')) {
                    itemDiv.style.backgroundColor = '';
                }
            });

            listContainer.appendChild(itemDiv);
        });
    }
}

function renderEditor(panel, data, isNew, view, index) {
    const editorContainer = panel.querySelector('#mc-editor');

    if (view === 'materials') {
        renderMaterialEditor(editorContainer, data, isNew, index, panel);
    } else {
        renderConstructionEditor(editorContainer, data, isNew, index, panel);
    }
}

// --- Material Editor ---

function renderMaterialEditor(container, data, isNew, index, panel) {
    // Fix: Ensure data is an object to prevent access errors
    const safeData = data || {};
    const type = safeData.type || 'Material';
    const name = safeData.name || '';

    let html = `
        <div class="space-y-4">
            <div>
                <label class="label">Material Type</label>
                <select id="mat-type-select" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                    <option value="Material" ${type === 'Material' ? 'selected' : ''}>Material</option>
                    <option value="Material:NoMass" ${type === 'Material:NoMass' ? 'selected' : ''}>Material:NoMass</option>
                    <option value="Material:AirGap" ${type === 'Material:AirGap' ? 'selected' : ''}>Material:AirGap</option>
                    <option value="WindowMaterial:Glazing" ${type === 'WindowMaterial:Glazing' ? 'selected' : ''}>WindowMaterial:Glazing</option>
                    <option value="WindowMaterial:Gas" ${type === 'WindowMaterial:Gas' ? 'selected' : ''}>WindowMaterial:Gas</option>
                    <option value="WindowMaterial:SimpleGlazingSystem" ${type === 'WindowMaterial:SimpleGlazingSystem' ? 'selected' : ''}>WindowMaterial:SimpleGlazingSystem</option>
                </select>
            </div>
            
            <div>
                <label class="label">Name</label>
                <input type="text" id="mat-name" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${name}">
            </div>

            <div id="mat-dynamic-fields" class="space-y-4">
                <!-- Fields injected here -->
            </div>

            <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                ${!isNew ? '<button class="btn btn-sm btn-danger" id="mat-delete-btn">Delete</button>' : ''}
                <button class="btn btn-sm btn-primary" id="mat-save-btn">Save</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    const fieldsContainer = container.querySelector('#mat-dynamic-fields');
    const typeSelect = container.querySelector('#mat-type-select');

    // Initial render of fields
    fieldsContainer.innerHTML = getMaterialFields(type, safeData);
    setupMaterialListeners(fieldsContainer);

    typeSelect.addEventListener('change', (e) => {
        const newType = e.target.value;
        // Reset fields for new type
        fieldsContainer.innerHTML = getMaterialFields(newType, {});
        setupMaterialListeners(fieldsContainer);
    });

    container.querySelector('#mat-save-btn').addEventListener('click', () => {
        saveMaterial(panel, isNew, index);
    });

    if (!isNew) {
        container.querySelector('#mat-delete-btn').addEventListener('click', () => {
            if (confirm(`Are you sure you want to delete ${name}?`)) {
                deleteMaterial(panel, index);
            }
        });
    }
}

const TOOLTIPS = {
    // Material
    roughness: "This alpha field defines the relative roughness of a particular material layer. This parameter only influences the convection coefficients, more specifically the exterior convection coefficient.",
    thickness: "This field characterizes the thickness of the material layer in meters. This should be the dimension of the layer in the direction perpendicular to the main path of heat conduction. This value must be a positive. Modeling layers thinner (less) than 0.003 m is not recommended.",
    conductivity: "This field is used to enter the thermal conductivity of the material layer. Units for this parameter are W/(m-K). Thermal conductivity must be greater than zero.",
    density: "This field is used to enter the density of the material layer in units of kg/m³. Density must be a positive quantity.",
    specificHeat: "This field represents the specific heat of the material layer in units of J/(kg-K). Only values of specific heat of 100 or larger are allowed.",
    thermalAbsorptance: "The thermal absorptance field represents the fraction of incident long wavelength (>2.5 microns) radiation that is absorbed by the material. Values for this field must be between 0.0 and 1.0 (with 1.0 representing “black body” conditions). The default value for this field is 0.9.",
    solarAbsorptance: "The solar absorptance field represents the fraction of incident solar radiation that is absorbed by the material. Solar radiation (0.3 to 2.537 μm) includes the visible spectrum as well as infrared and ultraviolet wavelengths. Values for this field must be between 0.0 and 1.0. The default value for this field is 0.7.",
    visibleAbsorptance: "The visible absorptance field represents the fraction of incident visible wavelength radiation that is absorbed by the material. Visible wavelength radiation (0.37 to 0.78 μm weighted by photopic response) is slightly different than solar radiation. Values for this field must be between 0.0 and 1.0. The default value for this field is 0.7.",

    // Material:NoMass & AirGap
    thermalResistance: "This field is used to enter the thermal resistance (R-value) of the material layer. Units for this parameter are (m²-K)/W. Thermal resistance must be greater than zero.",

    // WindowMaterial:Glazing
    opticalDataType: "Valid values for this field are SpectralAverage, Spectral, SpectralAndAngle, and BSDF. If SpectralAverage, values for solar transmittance and reflectance are assumed to be averaged over the solar spectrum.",
    solarTransmittance: "Transmittance at normal incidence averaged over the solar spectrum. Used only when Optical Data Type = SpectralAverage.",
    frontSolarReflectance: "Front-side reflectance at normal incidence averaged over the solar spectrum. Used only when Optical Data Type = SpectralAverage.",
    backSolarReflectance: "Back-side reflectance at normal incidence averaged over the solar spectrum. Used only when Optical Data Type = SpectralAverage.",
    visibleTransmittance: "Transmittance at normal incidence averaged over the solar spectrum and weighted by the response of the human eye. Used only when Optical Data Type = SpectralAverage.",
    frontVisibleReflectance: "Front-side reflectance at normal incidence averaged over the solar spectrum and weighted by the response of the human eye. Used only when Optical Data Type = SpectralAverage.",
    backVisibleReflectance: "Back-side reflectance at normal incidence averaged over the solar spectrum and weighted by the response of the human eye. Used only when Optical Data Type = SpectralAverage.",
    infraredTransmittance: "Long-wave transmittance at normal incidence.",
    frontEmissivity: "Front-side long-wave emissivity.",
    backEmissivity: "Back-side long-wave emissivity.",
    dirtCorrectionFactor: "This is a factor that corrects for the presence of dirt on the glass. The program multiplies the fields “Solar Transmittance at Normal Incidence” and “Visible Transmittance at Normal Incidence” by this factor if the material is used as the outer glass layer of an exterior window or glass door.",

    // WindowMaterial:Gas
    gasType: "The type of gas. The choices are Air, Argon, Krypton, or Xenon. If Gas Type = Custom you can use Conductivity Coefficient A, etc. to specify the properties of a different type of gas.",

    // WindowMaterial:SimpleGlazingSystem
    uFactor: "This field describes the value for window system U-Factor, or overall heat transfer coefficient. Units are in W/m²-K. This is the rated (NFRC) value for U-factor under winter heating conditions.",
    solarHeatGainCoeff: "This field describes the value for SHGC, or solar heat gain coefficient. There are no units. This is the rated (NFRC) value for SHGC under summer cooling conditions.",
    // visibleTransmittance reused from Glazing
};

function getMaterialFields(type, data) {
    const renderField = (label, field, inputType, optionsOrStep, val, unit = '', min = '', max = '') => {
        const tooltip = TOOLTIPS[field];
        const infoIcon = tooltip ? `
            <span class="info-icon">i
                <span class="info-popover">${tooltip}</span>
            </span>
        ` : '';

        let inputHtml = '';
        if (inputType === 'select') {
            const options = optionsOrStep;
            inputHtml = `
                <select class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" data-field="${field}">
                    ${options.map(opt => `<option value="${opt}"${opt === val ? ' selected' : ''}>${opt}</option>`).join('')}
                </select>
            `;
        } else if (inputType === 'range') {
            const step = optionsOrStep;
            inputHtml = `
                <div class="flex items-center space-x-2 mt-1">
                    <input type="range" min="${min}" max="${max}" step="${step}" class="w-full" data-field="${field}" value="${val}">
                    <span class="data-value font-mono w-12 text-right text-xs" data-display="${field}">${val}</span>
                </div>
            `;
        } else { // number
            const step = optionsOrStep;
            inputHtml = `
                <input type="number" step="${step}" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" data-field="${field}" value="${val !== undefined ? val : ''}">
            `;
        }

        return `
            <div>
                <label class="label text-xs">${label}${unit ? ` (${unit})` : ''}${infoIcon}</label>
                ${inputHtml}
            </div>
        `;
    };

    let html = '';

    if (type === 'Material') {
        const roughnessOpts = ['VeryRough', 'Rough', 'MediumRough', 'MediumSmooth', 'Smooth', 'VerySmooth'];
        html += `
            <div class="grid grid-cols-2 gap-2">
                ${renderField('Roughness', 'roughness', 'select', roughnessOpts, data.roughness || 'MediumRough')}
                ${renderField('Thickness', 'thickness', 'number', '0.001', data.thickness, 'm')}
            </div>
            <div class="grid grid-cols-2 gap-2">
                ${renderField('Conductivity', 'conductivity', 'range', '0.01', data.conductivity ?? 0.1, 'W/m-K', '0.01', '5.0')}
                ${renderField('Density', 'density', 'number', '1', data.density, 'kg/m³')}
            </div>
            <div class="grid grid-cols-2 gap-2">
                ${renderField('Specific Heat', 'specificHeat', 'number', '1', data.specificHeat, 'J/kg-K')}
            </div>
            <div class="grid grid-cols-3 gap-2">
                ${renderField('Thermal Abs', 'thermalAbsorptance', 'range', '0.01', data.thermalAbsorptance ?? 0.9, '', '0', '1')}
                ${renderField('Solar Abs', 'solarAbsorptance', 'range', '0.01', data.solarAbsorptance ?? 0.7, '', '0', '1')}
                ${renderField('Visible Abs', 'visibleAbsorptance', 'range', '0.01', data.visibleAbsorptance ?? 0.7, '', '0', '1')}
            </div>
        `;
    } else if (type === 'Material:NoMass') {
        const roughnessOpts = ['VeryRough', 'Rough', 'MediumRough', 'MediumSmooth', 'Smooth', 'VerySmooth'];
        html += `
            <div class="grid grid-cols-2 gap-2">
                ${renderField('Roughness', 'roughness', 'select', roughnessOpts, data.roughness || 'MediumRough')}
                ${renderField('Thermal Resistance', 'thermalResistance', 'number', '0.01', data.thermalResistance, 'm²K/W')}
            </div>
            <div class="grid grid-cols-3 gap-2">
                ${renderField('Thermal Abs', 'thermalAbsorptance', 'range', '0.01', data.thermalAbsorptance ?? 0.9, '', '0', '1')}
                ${renderField('Solar Abs', 'solarAbsorptance', 'range', '0.01', data.solarAbsorptance ?? 0.7, '', '0', '1')}
                ${renderField('Visible Abs', 'visibleAbsorptance', 'range', '0.01', data.visibleAbsorptance ?? 0.7, '', '0', '1')}
            </div>
        `;
    } else if (type === 'Material:AirGap') {
        html += `
            <div class="grid grid-cols-2 gap-2">
                ${renderField('Thermal Resistance', 'thermalResistance', 'number', '0.01', data.thermalResistance, 'm²K/W')}
            </div>
        `;
    } else if (type === 'WindowMaterial:Glazing') {
        const opticalTypes = ['SpectralAverage', 'Spectral', 'SpectralAndAngle', 'BSDF'];
        html += `
            <div class="grid grid-cols-2 gap-2">
                ${renderField('Optical Data Type', 'opticalDataType', 'select', opticalTypes, data.opticalDataType || 'SpectralAverage')}
                ${renderField('Thickness', 'thickness', 'number', '0.001', data.thickness, 'm')}
            </div>
            <div class="space-y-2 border border-[--grid-color] p-2 rounded">
                <h4 class="text-xs font-semibold text-[--text-secondary]">Solar Transmittance & Reflectance</h4>
                <div class="grid grid-cols-3 gap-2">
                    ${renderField('Solar Trans', 'solarTransmittance', 'number', '0.01', data.solarTransmittance)}
                    ${renderField('Front Refl', 'frontSolarReflectance', 'number', '0.01', data.frontSolarReflectance)}
                    ${renderField('Back Refl', 'backSolarReflectance', 'number', '0.01', data.backSolarReflectance)}
                </div>
            </div>
            <div class="space-y-2 border border-[--grid-color] p-2 rounded">
                <h4 class="text-xs font-semibold text-[--text-secondary]">Visible Transmittance & Reflectance</h4>
                <div class="grid grid-cols-3 gap-2">
                    ${renderField('Vis Trans', 'visibleTransmittance', 'number', '0.01', data.visibleTransmittance)}
                    ${renderField('Front Refl', 'frontVisibleReflectance', 'number', '0.01', data.frontVisibleReflectance)}
                    ${renderField('Back Refl', 'backVisibleReflectance', 'number', '0.01', data.backVisibleReflectance)}
                </div>
            </div>
            <div class="space-y-2 border border-[--grid-color] p-2 rounded">
                <h4 class="text-xs font-semibold text-[--text-secondary]">Infrared & Thermal</h4>
                <div class="grid grid-cols-2 gap-2">
                    ${renderField('IR Trans', 'infraredTransmittance', 'number', '0.01', data.infraredTransmittance)}
                    ${renderField('Conductivity', 'conductivity', 'number', '0.01', data.conductivity, 'W/m-K')}
                </div>
                <div class="grid grid-cols-2 gap-2">
                    ${renderField('Front Emiss', 'frontEmissivity', 'number', '0.01', data.frontEmissivity)}
                    ${renderField('Back Emiss', 'backEmissivity', 'number', '0.01', data.backEmissivity)}
                </div>
            </div>
            <div class="mt-2">
                ${renderField('Dirt Correction Factor', 'dirtCorrectionFactor', 'number', '0.01', data.dirtCorrectionFactor ?? 1.0)}
            </div>
        `;
    } else if (type === 'WindowMaterial:Gas') {
        const gasTypes = ['Air', 'Argon', 'Krypton', 'Xenon', 'Custom'];
        html += `
            <div class="grid grid-cols-2 gap-2">
                ${renderField('Gas Type', 'gasType', 'select', gasTypes, data.gasType || 'Air')}
                ${renderField('Thickness', 'thickness', 'number', '0.001', data.thickness, 'm')}
            </div>
        `;
    } else if (type === 'WindowMaterial:SimpleGlazingSystem') {
        html += `
            <div class="grid grid-cols-2 gap-2">
                ${renderField('U-Factor', 'uFactor', 'number', '0.01', data.uFactor, 'W/m²K')}
            </div>
            <div class="grid grid-cols-2 gap-2">
                ${renderField('SHGC', 'solarHeatGainCoeff', 'range', '0.01', data.solarHeatGainCoeff ?? 0.7, '', '0', '1')}
                ${renderField('Visible Trans', 'visibleTransmittance', 'range', '0.01', data.visibleTransmittance ?? 0.7, '', '0', '1')}
            </div>
        `;
    }

    return html;
}

function setupMaterialListeners(container) {
    container.querySelectorAll('input[type="range"]').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const display = container.querySelector(`[data-display="${e.target.dataset.field}"]`);
            if (display) display.textContent = e.target.value;
        });
    });
}

function saveMaterial(panel, isNew, index) {
    const container = panel.querySelector('#mc-editor');
    const name = container.querySelector('#mat-name').value.trim();
    const type = container.querySelector('#mat-type-select').value;

    if (!name) {
        alert('Name is required');
        return;
    }

    const { config } = getConfig(project);
    const materials = [...(config.materials || [])];

    // Check duplicate name
    const dupIndex = materials.findIndex((m, i) => m.name === name && (isNew || i !== index));
    if (dupIndex !== -1) {
        alert(`A material named "${name}" already exists.`);
        return;
    }

    const m = { type, name };
    const fieldsContainer = container.querySelector('#mat-dynamic-fields');

    const getNum = (sel) => {
        const el = fieldsContainer.querySelector(`[data-field="${sel}"]`);
        if (!el) return undefined;
        const v = parseFloat(el.value);
        return Number.isFinite(v) ? v : undefined;
    };

    const getStr = (sel) => {
        const el = fieldsContainer.querySelector(`[data-field="${sel}"]`);
        return el ? el.value : undefined;
    };

    // Extract fields based on type (same logic as original)
    if (type === 'Material') {
        m.roughness = getStr('roughness');
        m.thickness = getNum('thickness');
        m.conductivity = getNum('conductivity');
        m.density = getNum('density');
        m.specificHeat = getNum('specificHeat');
        m.thermalAbsorptance = getNum('thermalAbsorptance');
        m.solarAbsorptance = getNum('solarAbsorptance');
        m.visibleAbsorptance = getNum('visibleAbsorptance');
    } else if (type === 'Material:NoMass') {
        m.roughness = getStr('roughness');
        m.thermalResistance = getNum('thermalResistance');
        m.thermalAbsorptance = getNum('thermalAbsorptance');
        m.solarAbsorptance = getNum('solarAbsorptance');
        m.visibleAbsorptance = getNum('visibleAbsorptance');
    } else if (type === 'Material:AirGap') {
        m.thermalResistance = getNum('thermalResistance');
    } else if (type === 'WindowMaterial:Glazing') {
        m.opticalDataType = getStr('opticalDataType');
        m.thickness = getNum('thickness');
        m.solarTransmittance = getNum('solarTransmittance');
        m.frontSolarReflectance = getNum('frontSolarReflectance');
        m.backSolarReflectance = getNum('backSolarReflectance');
        m.visibleTransmittance = getNum('visibleTransmittance');
        m.frontVisibleReflectance = getNum('frontVisibleReflectance');
        m.backVisibleReflectance = getNum('backVisibleReflectance');
        m.infraredTransmittance = getNum('infraredTransmittance');
        m.frontEmissivity = getNum('frontEmissivity');
        m.backEmissivity = getNum('backEmissivity');
        m.conductivity = getNum('conductivity');
        m.dirtCorrectionFactor = getNum('dirtCorrectionFactor');
    } else if (type === 'WindowMaterial:Gas') {
        m.gasType = getStr('gasType');
        m.thickness = getNum('thickness');
    } else if (type === 'WindowMaterial:SimpleGlazingSystem') {
        m.uFactor = getNum('uFactor');
        m.solarHeatGainCoeff = getNum('solarHeatGainCoeff');
        m.visibleTransmittance = getNum('visibleTransmittance');
    }

    if (isNew) {
        materials.push(m);
    } else {
        materials[index] = { ...materials[index], ...m };
    }

    setMaterials(project, materials);
    renderList(panel);
    // Re-open editor
    const newIndex = isNew ? materials.length - 1 : index;
    renderEditor(panel, materials[newIndex], false, 'materials', newIndex);
}

function deleteMaterial(panel, index) {
    const { config } = getConfig(project);
    const materials = [...(config.materials || [])];
    const constructions = config.constructions || [];
    const m = materials[index];

    if (!m) return;

    const inUse = constructions.some(c => Array.isArray(c.layers) && c.layers.includes(m.name));
    if (inUse) {
        alert(`Cannot delete material "${m.name}": it is referenced by one or more constructions.`);
        return;
    }

    materials.splice(index, 1);
    setMaterials(project, materials);
    renderList(panel);
    panel.querySelector('#mc-editor').innerHTML = '<div class="text-[--text-secondary] text-sm text-center mt-10">Select a material to edit.</div>';
}

// --- Defaults Editor ---

function renderDefaultsEditor(container, panel) {
    const { config } = getConfig(project);
    const defaults = config.defaults || {};
    const constructions = config.constructions || [];
    const constructionNames = constructions.map(c => c.name);

    const renderSelect = (label, field, val) => `
        <div>
            <label class="label text-xs">${label}</label>
            <select class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" data-default-field="${field}">
                <option value="">(none)</option>
                ${constructionNames.map(n => `<option value="${n}"${n === val ? ' selected' : ''}>${n}</option>`).join('')}
            </select>
        </div>
    `;

    container.innerHTML = `
        <div class="space-y-4">
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Project Default Constructions</h3>
            <p class="text-xs text-[--text-secondary]">Select the default constructions to be applied to surfaces that do not have a specific construction assigned.</p>
            
            <div class="grid grid-cols-1 gap-4">
                ${renderSelect('Default Exterior Wall', 'wallConstruction', defaults.wallConstruction)}
                ${renderSelect('Default Roof', 'roofConstruction', defaults.roofConstruction)}
                ${renderSelect('Default Floor', 'floorConstruction', defaults.floorConstruction)}
                ${renderSelect('Default Window', 'windowConstruction', defaults.windowConstruction)}
            </div>

            <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-[--grid-color]">
                <button class="btn btn-sm btn-primary" id="defaults-save-btn">Save Defaults</button>
            </div>
        </div>
    `;

    container.querySelector('#defaults-save-btn').addEventListener('click', () => {
        const nextDefaults = { ...defaults };
        container.querySelectorAll('select[data-default-field]').forEach(sel => {
            const field = sel.dataset.defaultField;
            if (sel.value) {
                nextDefaults[field] = sel.value;
            } else {
                delete nextDefaults[field];
            }
        });

        // Use setConstructions to save defaults as well (since they are usually saved together or we need a new method)
        // Checking energyplusConfigService... setConstructions takes (project, constructions, defaults)
        setConstructions(project, constructions, nextDefaults);
        alert('Default constructions saved.');
        renderList(panel); // Refresh list to show (def) tags
    });
}

// --- Construction Editor ---

function renderConstructionEditor(container, data, isNew, index, panel) {
    const name = data?.name || '';
    const layers = data?.layers || [];

    let html = `
        <div class="space-y-4">
            <div>
                <label class="label">Name</label>
                <input type="text" id="con-name" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${name}">
            </div>
            
            <div class="flex justify-between items-center mt-4">
                <span class="label">Layers (Outside → Inside)</span>
                <button class="btn btn-xs btn-secondary" id="add-layer-btn">+ Add Layer</button>
            </div>
            
            <div id="con-layers" class="space-y-2">
                <!-- Layers injected here -->
            </div>

            <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                ${!isNew ? '<button class="btn btn-sm btn-danger" id="con-delete-btn">Delete</button>' : ''}
                <button class="btn btn-sm btn-primary" id="con-save-btn">Save</button>
            </div>
        </div>
    `;

    container.innerHTML = html;

    const layersContainer = container.querySelector('#con-layers');
    const { config } = getConfig(project);
    const materials = config.materials || [];

    // Build material options
    const builtinMaterialNames = [
        'RM_Concrete_200mm',
        'RM_Insulation_100mm',
        'RM_Gypsum_13mm',
        'RM_Screed_50mm',
        'RM_Glass_Double_Clear',
    ];
    const materialNames = Array.from(new Set([
        ...builtinMaterialNames,
        ...materials.map(m => m.name).filter(n => n)
    ]));

    const renderLayerRow = (val) => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-2';
        div.innerHTML = `
            <select class="w-full layer-select text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                <option value="">(select material)</option>
                ${materialNames.map(n => `<option value="${n}" ${n === val ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
            <button class="btn btn-xs btn-secondary move-up-btn">↑</button>
            <button class="btn btn-xs btn-secondary move-down-btn">↓</button>
            <button class="btn btn-xs btn-danger remove-layer-btn">×</button>
        `;

        div.querySelector('.move-up-btn').addEventListener('click', () => {
            if (div.previousElementSibling) layersContainer.insertBefore(div, div.previousElementSibling);
        });
        div.querySelector('.move-down-btn').addEventListener('click', () => {
            if (div.nextElementSibling) layersContainer.insertBefore(div.nextElementSibling, div);
        });
        div.querySelector('.remove-layer-btn').addEventListener('click', () => div.remove());

        return div;
    };

    if (layers.length === 0) {
        layersContainer.appendChild(renderLayerRow(''));
    } else {
        layers.forEach(l => layersContainer.appendChild(renderLayerRow(l)));
    }

    container.querySelector('#add-layer-btn').addEventListener('click', () => {
        layersContainer.appendChild(renderLayerRow(''));
    });

    container.querySelector('#con-save-btn').addEventListener('click', () => {
        saveConstruction(panel, isNew, index);
    });

    if (!isNew) {
        container.querySelector('#con-delete-btn').addEventListener('click', () => {
            if (confirm(`Are you sure you want to delete ${name}?`)) {
                deleteConstruction(panel, index);
            }
        });
    }
}

function saveConstruction(panel, isNew, index) {
    const container = panel.querySelector('#mc-editor');
    const name = container.querySelector('#con-name').value.trim();

    if (!name) {
        alert('Name is required');
        return;
    }

    const layers = [];
    container.querySelectorAll('.layer-select').forEach(sel => {
        if (sel.value) layers.push(sel.value);
    });

    if (layers.length === 0) {
        alert('At least one layer is required.');
        return;
    }

    const { config } = getConfig(project);
    const constructions = [...(config.constructions || [])];
    const defaults = config.defaults || {};

    // Check duplicate
    const dupIndex = constructions.findIndex((c, i) => c.name === name && (isNew || i !== index));
    if (dupIndex !== -1) {
        alert(`A construction named "${name}" already exists.`);
        return;
    }

    const newC = { name, layers };
    let oldName = isNew ? null : constructions[index].name;

    if (isNew) {
        constructions.push(newC);
    } else {
        constructions[index] = newC;
    }

    // Update defaults if renamed
    let nextDefaults = { ...defaults };
    if (oldName && oldName !== name) {
        Object.keys(nextDefaults).forEach(k => {
            if (nextDefaults[k] === oldName) nextDefaults[k] = name;
        });
    }

    setConstructions(project, constructions, nextDefaults);
    renderList(panel);
    const newIndex = isNew ? constructions.length - 1 : index;
    renderEditor(panel, constructions[newIndex], false, 'constructions', newIndex);
}

function deleteConstruction(panel, index) {
    const { config } = getConfig(project);
    const constructions = [...(config.constructions || [])];
    const defaults = config.defaults || {};
    const c = constructions[index];

    if (!c) return;

    if (Object.values(defaults).includes(c.name)) {
        alert(`Cannot delete construction "${c.name}": it is set as a default.`);
        return;
    }

    constructions.splice(index, 1);
    setConstructions(project, constructions, defaults);
    renderList(panel);
    panel.querySelector('#mc-editor').innerHTML = '<div class="text-[--text-secondary] text-sm text-center mt-10">Select a construction to edit.</div>';
}

