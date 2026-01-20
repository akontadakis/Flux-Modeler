// scripts/ShadingPanelUI.js

import { getAllApertures, getApertureById } from './geometry.js';
import { project } from './project.js';
import { updateScene } from './geometry.js';

/**
 * Manages the Shading & Solar Control panel UI.
 * Provides an aperture-centric interface for assigning shading devices to windows.
 */
export class ShadingPanelUI {
    constructor(containerId) {
        this.containerId = containerId;
        this.selectedApertureId = null;
        this.apertureDevices = new Map(); // Map<apertureId, deviceConfig>

        // Load existing shading devices from project metadata
        this.loadFromProject();
    }

    /**
     * Load shading device configurations from project metadata
     */
    async loadFromProject() {
        if (!project.metadata?.energyPlusConfig?.shading?.apertureDevices) {
            return;
        }

        const devices = project.metadata.energyPlusConfig.shading.apertureDevices;
        devices.forEach(entry => {
            this.apertureDevices.set(entry.apertureId, entry);
        });
    }

    /**
     * Render the complete shading panel UI
     */
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error(`Container with ID '${this.containerId}' not found`);
            return;
        }

        // Define categories for the left menu (matching Apertures panel style)
        this.categories = [
            { id: 'apertures', label: 'Aperture Selection' },
            { id: 'overhangs', label: 'Overhangs' },
            { id: 'fins', label: 'Side Fins' },
            { id: 'control', label: 'Shading Control' }
        ];
        this.currentCategory = 'apertures';

        container.innerHTML = `
            <div class="shading-panel-layout" style="display: flex; height: 100%; overflow: hidden;">
                <!-- Left Sidebar: Category List (matching Apertures panel style) -->
                <div style="width: 180px; border-right: 1px solid var(--grid-color); display: flex; flex-direction: column;">
                    <div style="padding: 0.5rem; border-bottom: 1px solid var(--grid-color);">
                        <span class="label">Configuration</span>
                    </div>
                    <div id="shading-category-list" class="scrollable-panel-inner" style="flex: 1; overflow-y: auto;">
                        <!-- Category items injected here -->
                    </div>
                </div>

                <!-- Right Content: Editor -->
                <div id="shading-category-editor" style="flex: 1; padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
                    <!-- Content injected here -->
                </div>
            </div>
        `;

        this.renderCategoryList();
        this.renderAllSections();
        this.selectCategory(this.currentCategory);
    }

    /**
     * Render the category sidebar list
     */
    renderCategoryList() {
        const listContainer = document.getElementById('shading-category-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        this.categories.forEach(cat => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.dataset.categoryId = cat.id;
            item.style.cssText = 'padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--grid-color);';
            item.innerHTML = `<div class="text-xs">${cat.label}</div>`;

            item.addEventListener('click', () => this.selectCategory(cat.id));

            item.addEventListener('mouseenter', () => {
                if (cat.id !== this.currentCategory) {
                    item.style.backgroundColor = 'var(--hover-bg)';
                }
            });

            item.addEventListener('mouseleave', () => {
                if (cat.id !== this.currentCategory) {
                    item.style.backgroundColor = '';
                }
            });

            listContainer.appendChild(item);
        });
    }

    /**
     * Render all editor sections (hidden by default)
     */
    renderAllSections() {
        const editor = document.getElementById('shading-category-editor');
        if (!editor) return;

        editor.innerHTML = '';

        // Aperture Selection section
        editor.appendChild(this.createApertureSelectionSection());

        // Overhangs section
        editor.appendChild(this.createOverhangsSection());

        // Fins section
        editor.appendChild(this.createFinsSection());

        // Shading Control section
        editor.appendChild(this.createShadingControlSection());
    }

    /**
     * Select a category and show its section
     */
    selectCategory(categoryId) {
        this.currentCategory = categoryId;

        // Update sidebar styling
        const listItems = document.querySelectorAll('#shading-category-list .list-item');
        listItems.forEach(item => {
            if (item.dataset.categoryId === categoryId) {
                item.classList.add('active');
                item.style.backgroundColor = 'var(--accent-color)';
                item.style.color = 'white';
            } else {
                item.classList.remove('active');
                item.style.backgroundColor = '';
                item.style.color = '';
            }
        });

        // Show/hide content sections
        const sections = document.querySelectorAll('[id^="shading-section-"]');
        sections.forEach(sec => sec.classList.add('hidden'));

        const activeSection = document.getElementById(`shading-section-${categoryId}`);
        if (activeSection) {
            activeSection.classList.remove('hidden');
        }
    }

    /**
     * Create the Aperture Selection section
     */
    createApertureSelectionSection() {
        const section = document.createElement('div');
        section.id = 'shading-section-apertures';
        section.className = 'space-y-4';

        section.innerHTML = `
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2 text-[--text-primary]">Aperture Selection</h3>
            
            <div style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <p style="margin: 0; font-size: 0.75rem; color: var(--text-tertiary); line-height: 1.4;">
                        Choose a window to configure its shading devices
                    </p>
                </div>
                <button id="refresh-aperture-list-btn" class="btn btn-sm" title="Refresh Aperture List" style="
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                    padding: 0.375rem 0.5rem;
                ">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                    </svg>
                    <span class="text-xs">Refresh</span>
                </button>
            </div>
            <div id="aperture-list-container" style="max-height: 350px; overflow-y: auto;">
                <!-- Aperture list will be populated here -->
            </div>
        `;

        // Bind refresh button after section is appended to DOM
        setTimeout(() => {
            const refreshBtn = document.getElementById('refresh-aperture-list-btn');
            if (refreshBtn && !refreshBtn._bound) {
                refreshBtn._bound = true;
                refreshBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.refresh();
                });
            }
            this.renderApertureList();
        }, 0);

        return section;
    }

    /**
     * Create the Overhangs editor section
     */
    createOverhangsSection() {
        const section = document.createElement('div');
        section.id = 'shading-section-overhangs';
        section.className = 'hidden space-y-4';

        section.innerHTML = `
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2 text-[--text-primary]">Overhang Configuration</h3>
            <div id="overhang-editor-content">
                <div style="color: var(--text-tertiary); text-align: center; padding: 2rem;">
                    Select an aperture first to configure overhangs
                </div>
            </div>
        `;

        return section;
    }

    /**
     * Create the Fins editor section
     */
    createFinsSection() {
        const section = document.createElement('div');
        section.id = 'shading-section-fins';
        section.className = 'hidden space-y-4';

        section.innerHTML = `
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2 text-[--text-primary]">Side Fins Configuration</h3>
            <div id="fins-editor-content">
                <div style="color: var(--text-tertiary); text-align: center; padding: 2rem;">
                    Select an aperture first to configure side fins
                </div>
            </div>
        `;

        return section;
    }

    /**
     * Create the Shading Control editor section
     */
    createShadingControlSection() {
        const section = document.createElement('div');
        section.id = 'shading-section-control';
        section.className = 'hidden space-y-4';

        section.innerHTML = `
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2 text-[--text-primary]">Shading Control</h3>
            <div id="control-editor-content">
                <div style="color: var(--text-tertiary); text-align: center; padding: 2rem;">
                    Select an aperture first to configure shading control
                </div>
            </div>
        `;

        return section;
    }

    /**
     * Refresh the aperture list (call this when geometry changes)
     */
    refresh() {
        this.renderApertureList();
    }

    /**
     * Render the list of apertures in the left sidebar
     */
    renderApertureList() {
        const listContainer = document.getElementById('aperture-list-container');
        if (!listContainer) return;

        // Bind refresh button (if it exists)
        const refreshBtn = document.getElementById('refresh-aperture-list-btn');
        if (refreshBtn) {
            // Remove old listener if any (simple way is clone or specific remove, 
            // but since we re-render often, just cloneNode is destructive. 
            // Just add it, as the element is re-created on render() but not on renderApertureList() if just lists updates.
            // Wait, refresh button is in sidebar, created in render(). 
            // renderApertureList creates the list items. The button is static in the sidebar.
            // Let's attach safely.
            const newBtn = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(newBtn, refreshBtn);
            newBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.refresh();
            });
        }

        const apertures = getAllApertures();

        if (apertures.length === 0) {
            listContainer.innerHTML = `
                <div style="color: var(--text-tertiary); font-size: 0.75rem; text-align: center; padding: 1rem;">
                    No apertures found. Add windows in the Apertures panel first.
                </div>
            `;
            return;
        }

        // Group apertures by wall
        const byWall = {
            N: apertures.filter(a => a.wallIdUpper === 'N'),
            S: apertures.filter(a => a.wallIdUpper === 'S'),
            E: apertures.filter(a => a.wallIdUpper === 'E'),
            W: apertures.filter(a => a.wallIdUpper === 'W')
        };

        let html = '';
        ['N', 'S', 'E', 'W'].forEach(wall => {
            if (byWall[wall].length > 0) {
                html += `
                    <div class="wall-group" style="margin-bottom: 1rem;">
                        <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.5rem; text-transform: uppercase;">
                            ${wall === 'N' ? 'North' : wall === 'S' ? 'South' : wall === 'E' ? 'East' : 'West'} Wall
                        </div>
                        ${byWall[wall].map(aperture => this.createApertureListItem(aperture)).join('')}
                    </div>
                `;
            }
        });

        listContainer.innerHTML = html;

        // Add click handlers
        listContainer.querySelectorAll('.aperture-list-item').forEach(item => {
            item.addEventListener('click', () => {
                const apertureId = item.dataset.apertureId;
                this.selectAperture(apertureId);
            });
        });
    }

    /**
     * Create HTML for a single aperture list item
     */
    createApertureListItem(aperture) {
        const hasDevices = this.apertureDevices.has(aperture.id);
        const deviceCount = hasDevices ? this.getDeviceCount(this.apertureDevices.get(aperture.id)) : 0;
        const isSelected = this.selectedApertureId === aperture.id;

        return `
            <div class="aperture-list-item ${isSelected ? 'selected' : ''}" 
                 data-aperture-id="${aperture.id}"
                 style="
                     padding: 0.5rem;
                     margin-bottom: 0.25rem;
                     border-radius: 4px;
                     cursor: pointer;
                     background: ${isSelected ? 'var(--accent-color)' : 'transparent'};
                     border: 1px solid ${isSelected ? 'var(--accent-color)' : 'var(--border-color)'}; 
                     transition: all 0.2s;
                 ">
                <div style="font-size: 0.8rem; font-weight: 500; color: ${isSelected ? '#fff' : 'var(--text-primary)'};">
                    ${aperture.name}
                </div>
                <div style="font-size: 0.7rem; color: ${isSelected ? 'rgba(255,255,255,0.8)' : 'var(--text-tertiary)'}; margin-top: 0.25rem;">
                    ${aperture.dimensions.width.toFixed(2)}m × ${aperture.dimensions.height.toFixed(2)}m
                    ${deviceCount > 0 ? `• ${deviceCount} device${deviceCount > 1 ? 's' : ''}` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Get total device count for an aperture configuration
     */
    getDeviceCount(config) {
        let count = 0;
        if (config.overhangs && config.overhangs.length > 0) count += config.overhangs.length;
        if (config.fins && config.fins.length > 0) count += config.fins.length;
        if (config.shadingControl) count += 1;
        return count;
    }

    /**
     * Select an aperture and render its device editor
     */
    selectAperture(apertureId) {
        this.selectedApertureId = apertureId;

        // Update list selection state
        document.querySelectorAll('.aperture-list-item').forEach(item => {
            const isSelected = item.dataset.apertureId === apertureId;
            item.classList.toggle('selected', isSelected);
            item.style.background = isSelected ? 'var(--accent-color)' : 'transparent';
            item.style.borderColor = isSelected ? 'var(--accent-color)' : 'var(--border-color)';

            // Update text colors
            const titleEl = item.querySelector('div:first-child');
            const detailEl = item.querySelector('div:last-child');
            if (titleEl) titleEl.style.color = isSelected ? '#fff' : 'var(--text-primary)';
            if (detailEl) detailEl.style.color = isSelected ? 'rgba(255,255,255,0.8)' : 'var(--text-tertiary)';
        });

        // Render content for all section editors
        this.renderOverhangEditorContent(apertureId);
        this.renderFinsEditorContent(apertureId);
        this.renderControlEditorContent(apertureId);
    }

    /**
     * Render overhang editor content for selected aperture
     */
    renderOverhangEditorContent(apertureId) {
        const container = document.getElementById('overhang-editor-content');
        if (!container) return;

        const aperture = getApertureById(apertureId);
        if (!aperture) {
            container.innerHTML = '<div style="color: var(--text-error); padding: 1rem;">Aperture not found</div>';
            return;
        }

        const deviceConfig = this.apertureDevices.get(apertureId) || {
            apertureId,
            overhangs: [],
            fins: [],
            shadingControl: null
        };

        this.renderOverhangsEditor(container, apertureId, deviceConfig.overhangs);
    }

    /**
     * Render fins editor content for selected aperture
     */
    renderFinsEditorContent(apertureId) {
        const container = document.getElementById('fins-editor-content');
        if (!container) return;

        const aperture = getApertureById(apertureId);
        if (!aperture) {
            container.innerHTML = '<div style="color: var(--text-error); padding: 1rem;">Aperture not found</div>';
            return;
        }

        const deviceConfig = this.apertureDevices.get(apertureId) || {
            apertureId,
            overhangs: [],
            fins: [],
            shadingControl: null
        };

        this.renderFinsEditor(container, apertureId, deviceConfig.fins);
    }

    /**
     * Render shading control editor content for selected aperture
     */
    renderControlEditorContent(apertureId) {
        const container = document.getElementById('control-editor-content');
        if (!container) return;

        const aperture = getApertureById(apertureId);
        if (!aperture) {
            container.innerHTML = '<div style="color: var(--text-error); padding: 1rem;">Aperture not found</div>';
            return;
        }

        const deviceConfig = this.apertureDevices.get(apertureId) || {
            apertureId,
            overhangs: [],
            fins: [],
            shadingControl: null
        };

        this.renderShadingControlEditor(container, apertureId, deviceConfig.shadingControl);
    }

    /**
     * Render the device editor for the selected aperture
     */
    renderDeviceEditor(apertureId) {
        const editorContainer = document.getElementById('device-editor-container');
        if (!editorContainer) return;

        const aperture = getApertureById(apertureId);
        if (!aperture) {
            editorContainer.innerHTML = '<div style="color: var(--text-error); padding: 1rem;">Aperture not found</div>';
            return;
        }

        const deviceConfig = this.apertureDevices.get(apertureId) || {
            apertureId,
            overhangs: [],
            fins: [],
            shadingControl: null
        };

        editorContainer.innerHTML = `
            <div class="device-editor">
                <!-- Header -->
                <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1rem;">
                    <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem; color: var(--text-primary);">
                        ${aperture.name}
                    </h3>
                    <div style="font-size: 0.75rem; color: var(--text-tertiary);">
                        ${aperture.wallIdUpper} Wall • ${aperture.dimensions.width.toFixed(2)}m × ${aperture.dimensions.height.toFixed(2)}m
                    </div>
                </div>

                <!-- Device Type Tabs -->
                <div class="device-type-tabs" style="display: flex; gap: 0.5rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
                    <button class="device-tab active" data-device-type="overhangs" style="
                        padding: 0.5rem 1rem;
                        background: transparent;
                        border: none;
                        border-bottom: 2px solid var(--highlight-color);
                        color: var(--highlight-color);
                        cursor: pointer;
                        font-size: 0.85rem;
                    ">Overhangs</button>
                    <button class="device-tab" data-device-type="fins" style="
                        padding: 0.5rem 1rem;
                        background: transparent;
                        border: none;
                        border-bottom: 2px solid transparent;
                        color: var(--text-secondary);
                        cursor: pointer;
                        font-size: 0.85rem;
                    ">Fins</button>
                    <button class="device-tab" data-device-type="control" style="
                        padding: 0.5rem 1rem;
                        background: transparent;
                        border: none;
                        border-bottom: 2px solid transparent;
                        color: var(--text-secondary);
                        cursor: pointer;
                        font-size: 0.85rem;
                    ">Shading Control</button>
                </div>

                <!-- Device Content -->
                <div id="device-content-container">
                    <!-- Content will be populated based on selected tab -->
                </div>
            </div>
        `;

        // Add tab switching handlers
        editorContainer.querySelectorAll('.device-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                // Update tab styles
                editorContainer.querySelectorAll('.device-tab').forEach(t => {
                    const isActive = t === tab;
                    t.classList.toggle('active', isActive);
                    t.style.borderBottomColor = isActive ? 'var(--highlight-color)' : 'transparent';
                    t.style.color = isActive ? 'var(--highlight-color)' : 'var(--text-secondary)';
                });

                // Render content for selected device type
                const deviceType = tab.dataset.deviceType;
                this.renderDeviceContent(apertureId, deviceType);
            });
        });

        // Render initial content (overhangs)
        this.renderDeviceContent(apertureId, 'overhangs');
    }

    /**
     * Render the content for a specific device type
     */
    renderDeviceContent(apertureId, deviceType) {
        const contentContainer = document.getElementById('device-content-container');
        if (!contentContainer) return;

        const deviceConfig = this.apertureDevices.get(apertureId) || {
            apertureId,
            overhangs: [],
            fins: [],
            shadingControl: null
        };

        if (deviceType === 'overhangs') {
            this.renderOverhangsEditor(contentContainer, apertureId, deviceConfig.overhangs);
        } else if (deviceType === 'fins') {
            this.renderFinsEditor(contentContainer, apertureId, deviceConfig.fins);
        } else if (deviceType === 'control') {
            this.renderShadingControlEditor(contentContainer, apertureId, deviceConfig.shadingControl);
        }
    }

    /**
     * Render the overhangs editor
     */
    renderOverhangsEditor(container, apertureId, overhangs) {
        const hasOverhang = overhangs && overhangs.length > 0;
        const overhang = hasOverhang ? overhangs[0] : {
            depth: 1.0,
            heightAbove: 0.5,
            leftExtension: 0.2,
            rightExtension: 0.2,
            tiltAngle: 90
        };

        container.innerHTML = `
            <div class="overhang-editor space-y-4">
                ${this.getSelectedApertureInfoHTML()}
                
                <label class="flex items-center cursor-pointer" for="overhang-enabled">
                    <input type="checkbox" id="overhang-enabled" ${hasOverhang ? 'checked' : ''}>
                    <span class="ml-3 text-sm font-normal text-[--text-primary]">Enable Overhang</span>
                </label>

                <div id="overhang-params" class="${hasOverhang ? '' : 'hidden'} space-y-4">
                    ${this.createRangeControlHTML('overhang-depth', 'Depth (m)', 0.1, 3, overhang.depth, 0.1, 'm')}
                    ${this.createRangeControlHTML('overhang-height-above', 'Height Above Window (m)', 0, 2, overhang.heightAbove, 0.05, 'm')}
                    ${this.createRangeControlHTML('overhang-left-ext', 'Left Extension (m)', 0, 2, overhang.leftExtension, 0.05, 'm')}
                    ${this.createRangeControlHTML('overhang-right-ext', 'Right Extension (m)', 0, 2, overhang.rightExtension, 0.05, 'm')}
                    ${this.createRangeControlHTML('overhang-tilt', 'Tilt Angle (°)', 0, 180, overhang.tiltAngle, 1, '°')}

                    <div class="flex gap-2 mt-4">
                        <button id="save-overhang-btn" class="btn btn-primary flex-1">
                            Save Overhang
                        </button>
                        ${hasOverhang ? `
                            <button id="delete-overhang-btn" class="btn btn-danger">
                                Delete
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        // Add range slider listeners
        this.addRangeListeners(container);

        // Event handlers
        const enabledCheckbox = container.querySelector('#overhang-enabled');
        const paramsDiv = container.querySelector('#overhang-params');

        enabledCheckbox.addEventListener('change', () => {
            paramsDiv.classList.toggle('hidden', !enabledCheckbox.checked);
        });

        const saveBtn = container.querySelector('#save-overhang-btn');
        saveBtn?.addEventListener('click', () => this.saveOverhang(apertureId));

        const deleteBtn = container.querySelector('#delete-overhang-btn');
        deleteBtn?.addEventListener('click', () => this.deleteOverhang(apertureId));
    }

    /**
     * Render the fins editor
     */
    renderFinsEditor(container, apertureId, fins) {
        const hasFins = fins && fins.length > 0;
        const finConfig = hasFins ? fins[0] : {
            leftFin: { enabled: false, depth: 1.0, heightAbove: 0.5, heightBelow: 0.5, tiltAngle: 90 },
            rightFin: { enabled: false, depth: 1.0, heightAbove: 0.5, heightBelow: 0.5, tiltAngle: 90 }
        };

        container.innerHTML = `
            <div class="fins-editor space-y-4">
                ${this.getSelectedApertureInfoHTML()}

                <!-- Left Fin -->
                <div class="fin-section border border-[--grid-color] rounded-md p-3">
                    <label class="flex items-center cursor-pointer" for="left-fin-enabled">
                        <input type="checkbox" id="left-fin-enabled" ${finConfig.leftFin?.enabled ? 'checked' : ''}>
                        <span class="ml-3 text-sm font-semibold text-[--text-primary]">Left Fin</span>
                    </label>
                    <div id="left-fin-params" class="${finConfig.leftFin?.enabled ? '' : 'hidden'} space-y-4 mt-3 pt-3 border-t border-[--grid-color]">
                        ${this.createRangeControlHTML('left-fin-depth', 'Depth (m)', 0.1, 3, finConfig.leftFin?.depth || 1.0, 0.1, 'm')}
                        ${this.createRangeControlHTML('left-fin-height-above', 'Height Above (m)', 0, 2, finConfig.leftFin?.heightAbove || 0.5, 0.05, 'm')}
                        ${this.createRangeControlHTML('left-fin-height-below', 'Height Below (m)', 0, 2, finConfig.leftFin?.heightBelow || 0.5, 0.05, 'm')}
                    </div>
                </div>

                <!-- Right Fin -->
                <div class="fin-section border border-[--grid-color] rounded-md p-3">
                    <label class="flex items-center cursor-pointer" for="right-fin-enabled">
                        <input type="checkbox" id="right-fin-enabled" ${finConfig.rightFin?.enabled ? 'checked' : ''}>
                        <span class="ml-3 text-sm font-semibold text-[--text-primary]">Right Fin</span>
                    </label>
                    <div id="right-fin-params" class="${finConfig.rightFin?.enabled ? '' : 'hidden'} space-y-4 mt-3 pt-3 border-t border-[--grid-color]">
                        ${this.createRangeControlHTML('right-fin-depth', 'Depth (m)', 0.1, 3, finConfig.rightFin?.depth || 1.0, 0.1, 'm')}
                        ${this.createRangeControlHTML('right-fin-height-above', 'Height Above (m)', 0, 2, finConfig.rightFin?.heightAbove || 0.5, 0.05, 'm')}
                        ${this.createRangeControlHTML('right-fin-height-below', 'Height Below (m)', 0, 2, finConfig.rightFin?.heightBelow || 0.5, 0.05, 'm')}
                    </div>
                </div>

                <!-- Save Button -->
                <div class="flex gap-2">
                    <button id="save-fins-btn" class="btn btn-primary flex-1">
                        Save Fins
                    </button>
                    ${hasFins ? `
                        <button id="delete-fins-btn" class="btn btn-danger">
                            Delete All
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        // Add range slider listeners
        this.addRangeListeners(container);

        // Event handlers for enabling/disabling fin parameters
        const leftFinCheckbox = container.querySelector('#left-fin-enabled');
        const leftFinParams = container.querySelector('#left-fin-params');
        leftFinCheckbox.addEventListener('change', () => {
            leftFinParams.classList.toggle('hidden', !leftFinCheckbox.checked);
        });

        const rightFinCheckbox = container.querySelector('#right-fin-enabled');
        const rightFinParams = container.querySelector('#right-fin-params');
        rightFinCheckbox.addEventListener('change', () => {
            rightFinParams.classList.toggle('hidden', !rightFinCheckbox.checked);
        });

        const saveBtn = container.querySelector('#save-fins-btn');
        saveBtn?.addEventListener('click', () => this.saveFins(apertureId));

        const deleteBtn = container.querySelector('#delete-fins-btn');
        deleteBtn?.addEventListener('click', () => this.deleteFins(apertureId));
    }

    /**
     * Render the shading control editor
     */
    renderShadingControlEditor(container, apertureId, shadingControl) {
        const hasControl = !!shadingControl;
        const control = hasControl ? shadingControl : {
            shadingType: 'InteriorShade',
            materialName: '',
            controlType: 'OnIfHighSolarOnWindow',
            setpoint1: 200,
            setpoint2: '',
            scheduleName: '',
            glareControlIsActive: false,
            slatControl: 'FixedSlatAngle',
            slatSchedule: ''
        };

        // Fetch options from project metadata
        const metadata = project.metadata?.energyPlusConfig || {};
        const materials = metadata.materials || [];
        const schedules = (metadata.schedules?.compact || []).map(s => s.name);

        // Filter materials suitable for shading
        const shadingMaterials = materials.filter(m =>
            ['WindowMaterial:Shade', 'WindowMaterial:Blind', 'WindowMaterial:Screen'].includes(m.type)
        ).map(m => m.fields?.Name);

        // Shading Types
        const shadingTypes = [
            'InteriorShade', 'ExteriorShade', 'ExteriorScreen',
            'InteriorBlind', 'ExteriorBlind', 'BetweenGlassShade',
            'BetweenGlassBlind', 'SwitchableGlazing'
        ];

        // Control Types
        const controlTypes = [
            'AlwaysOn', 'AlwaysOff', 'OnIfScheduleAllows',
            'OnIfHighSolarOnWindow', 'OnIfHighHorizontalSolar',
            'OnIfHighOutdoorAirTemperature', 'OnIfHighZoneAirTemperature',
            'OnIfHighGlare', 'MeetDaylightIlluminanceSetpoint'
        ];

        container.innerHTML = `
            <div class="shading-control-editor space-y-4">
                ${this.getSelectedApertureInfoHTML()}
                
                <label class="flex items-center cursor-pointer mb-2" for="control-enabled">
                    <input type="checkbox" id="control-enabled" ${hasControl ? 'checked' : ''}>
                    <span class="ml-3 text-sm font-bold text-[--text-primary]">Enable Window Shading Control</span>
                </label>

                <div id="control-params" class="${hasControl ? '' : 'hidden'} space-y-4 border-l-2 border-[--border-color] pl-4">
                    
                    ${this.createSelectInput('shading-type', 'Shading Type', control.shadingType, shadingTypes.map(t => ({ value: t, label: t })))}

                    ${this.createSelectInput('material-name', 'Shading Material', control.materialName,
            [{ value: '', label: '-- Select Material --' }, ...shadingMaterials.map(m => ({ value: m, label: m }))]
        )}

                    ${this.createSelectInput('control-type', 'Control Type', control.controlType, controlTypes.map(t => ({ value: t, label: t })))}

                    <div class="grid grid-cols-2 gap-2">
                        ${this.createTextInput('control-setpoint1', 'Setpoint 1 (W/m² / °C)', control.setpoint1 || '')}
                        ${this.createTextInput('control-setpoint2', 'Setpoint 2 (Opt.)', control.setpoint2 || '')}
                    </div>

                    ${this.createSelectInput('control-schedule', 'Availability Schedule', control.scheduleName,
            [{ value: '', label: '-- Always Available --' }, ...schedules.map(s => ({ value: s, label: s }))]
        )}

                     <label class="flex items-center cursor-pointer" for="glare-active">
                        <input type="checkbox" id="glare-active" ${control.glareControlIsActive ? 'checked' : ''}>
                        <span class="ml-2 text-sm text-[--text-secondary]">Glare Control Active</span>
                    </label>

                    <div id="blind-settings" class="hidden space-y-4 mt-2 p-3 bg-[--input-bg] rounded border border-[--border-color]">
                         <div class="text-xs font-bold text-[--text-tertiary] uppercase mb-1">Blind Settings</div>
                         ${this.createSelectInput('slat-control', 'Slat Angle Control', control.slatControl, [
            { value: 'FixedSlatAngle', label: 'Fixed Slat Angle' },
            { value: 'ScheduledSlatAngle', label: 'Scheduled Slat Angle' },
            { value: 'BlockBeamSolar', label: 'Block Beam Solar' }
        ])}
                         ${this.createSelectInput('slat-schedule', 'Slat Angle Schedule', control.slatSchedule,
            [{ value: '', label: '-- Select Schedule --' }, ...schedules.map(s => ({ value: s, label: s }))]
        )}
                    </div>

                    <div class="flex gap-2 mt-6 pt-4 border-t border-[--border-color]">
                        <button id="save-control-btn" class="btn btn-primary flex-1">
                            Save Control
                        </button>
                        ${hasControl ? `
                            <button id="delete-control-btn" class="btn btn-danger">
                                Delete
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        // Logic to toggle blind settings visibility
        const typeSelect = container.querySelector('#shading-type');
        const blindSettings = container.querySelector('#blind-settings');
        const updateBlindVisibility = () => {
            const val = typeSelect.value || '';
            blindSettings.classList.toggle('hidden', !val.includes('Blind'));
        };
        typeSelect.addEventListener('change', updateBlindVisibility);
        updateBlindVisibility(); // init

        const enabledCheckbox = container.querySelector('#control-enabled');
        const paramsDiv = container.querySelector('#control-params');
        enabledCheckbox.addEventListener('change', () => {
            paramsDiv.classList.toggle('hidden', !enabledCheckbox.checked);
        });

        const saveBtn = container.querySelector('#save-control-btn');
        saveBtn?.addEventListener('click', () => this.saveShadingControl(apertureId));

        const deleteBtn = container.querySelector('#delete-control-btn');
        deleteBtn?.addEventListener('click', () => this.deleteShadingControl(apertureId));
    }

    /**
     * Helper to create a range slider control (matching Apertures panel style)
     */
    createRangeControlHTML(id, label, min, max, value, step, unit = '') {
        const displayVal = `${value}${unit}`;
        return `
            <div>
                <label class="label" for="${id}">${label}</label>
                <div class="flex items-center space-x-3 mt-1">
                    <input type="range" id="${id}" min="${min}" max="${max}" value="${value}" step="${step}" data-unit="${unit}">
                    <span id="${id}-val" class="data-value font-mono w-16 text-left">${displayVal}</span>
                </div>
            </div>`;
    }

    /**
     * Helper to create a number input field (for special cases)
     */
    createNumberInput(id, label, value, min, max, step, tooltip = '') {
        return `
            <div style="margin-bottom: 1rem;">
                <label for="${id}" style="display: block; font-size: 0.8rem; margin-bottom: 0.25rem; color: var(--text-secondary);">
                    ${label}
                </label>
                <input type="number" id="${id}" value="${value}" min="${min}" max="${max}" step="${step}"
                       title="${tooltip}"
                       style="width: 100%; padding: 0.5rem; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
                ${tooltip ? `<div style="font-size: 0.7rem; color: var(--text-tertiary); margin-top: 0.25rem;">${tooltip}</div>` : ''}
            </div>
        `;
    }

    /**
     * Add range slider event listeners to a container
     */
    addRangeListeners(container) {
        container.querySelectorAll('input[type="range"]').forEach(input => {
            const span = container.querySelector(`#${input.id}-val`);
            if (span) {
                input.addEventListener('input', () => {
                    const v = parseFloat(input.value);
                    const unit = input.dataset.unit || '';
                    span.textContent = `${v}${unit}`;
                });
            }
        });
    }

    /**
     * Generate selected aperture info HTML (matching Apertures wall selection style)
     */
    getSelectedApertureInfoHTML() {
        if (!this.selectedApertureId) {
            return `
                <div class="bg-[--bg-secondary] rounded-md p-3 border border-[--grid-color] mb-4">
                    <div class="flex items-center justify-between">
                        <span class="label text-xs">Selected Aperture:</span>
                    </div>
                    <div class="flex flex-wrap gap-2 min-h-[32px] p-1 mt-2">
                        <span class="text-xs text-[--text-secondary] italic self-center">No aperture selected</span>
                    </div>
                </div>
            `;
        }

        const aperture = getApertureById(this.selectedApertureId);
        if (!aperture) {
            return `
                <div class="bg-[--bg-secondary] rounded-md p-3 border border-[--grid-color] mb-4">
                    <span class="text-xs text-[--text-error]">Aperture not found</span>
                </div>
            `;
        }

        const wallLabel = { N: 'North', S: 'South', E: 'East', W: 'West' }[aperture.wallIdUpper] || aperture.wallIdUpper;

        return `
            <div class="bg-[--bg-secondary] rounded-md p-3 border border-[--grid-color] mb-4">
                <div class="flex items-center justify-between mb-2">
                    <span class="label text-xs">Selected Aperture:</span>
                </div>
                <div class="flex flex-wrap gap-2 min-h-[32px] p-1">
                    <span class="px-2 py-1 bg-[--accent-color] text-white text-xs rounded shadow-sm flex items-center gap-1">
                        <span>${aperture.name}</span>
                    </span>
                </div>
                <div class="text-xs text-[--text-tertiary] mt-2">
                    ${wallLabel} Wall • ${aperture.dimensions.width.toFixed(2)}m × ${aperture.dimensions.height.toFixed(2)}m
                </div>
            </div>
        `;
    }

    /**
     * Helper to create a text input field
     */
    createTextInput(id, label, value, tooltip = '') {
        return `
            <div style="margin-bottom: 1rem;">
                <label for="${id}" style="display: block; font-size: 0.8rem; margin-bottom: 0.25rem; color: var(--text-secondary);">
                    ${label}
                </label>
                <input type="text" id="${id}" value="${value}"
                       title="${tooltip}"
                       style="width: 100%; padding: 0.5rem; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
            </div>
        `;
    }

    /**
     * Helper to create a select dropdown
     */
    createSelectInput(id, label, value, options) {
        return `
            <div style="margin-bottom: 1rem;">
                <label for="${id}" style="display: block; font-size: 0.8rem; margin-bottom: 0.25rem; color: var(--text-secondary);">
                    ${label}
                </label>
                <select id="${id}" style="width: 100%; padding: 0.5rem; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
                    ${options.map(opt => `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
                </select>
            </div>
        `;
    }

    /**
     * Save overhang configuration
     */
    async saveOverhang(apertureId) {
        const enabled = document.getElementById('overhang-enabled')?.checked;

        if (!enabled) {
            await this.deleteOverhang(apertureId);
            return;
        }

        const overhang = {
            depth: parseFloat(document.getElementById('overhang-depth')?.value || 1.0),
            heightAbove: parseFloat(document.getElementById('overhang-height-above')?.value || 0.5),
            leftExtension: parseFloat(document.getElementById('overhang-left-ext')?.value || 0.2),
            rightExtension: parseFloat(document.getElementById('overhang-right-ext')?.value || 0.2),
            tiltAngle: parseFloat(document.getElementById('overhang-tilt')?.value || 90)
        };

        // Update local cache
        let config = this.apertureDevices.get(apertureId) || { apertureId, overhangs: [], fins: [], shadingControl: null };
        config.overhangs = [overhang];
        this.apertureDevices.set(apertureId, config);

        // Save to project
        await project.updateApertureShadingDevices(apertureId, config);

        // Update 3D scene
        updateScene();

        // Refresh UI
        this.renderApertureList();
        this.selectAperture(apertureId);

        console.log('Overhang saved for', apertureId, overhang);
    }

    /**
     * Delete overhang configuration
     */
    async deleteOverhang(apertureId) {
        let config = this.apertureDevices.get(apertureId);
        if (config) {
            config.overhangs = [];
            this.apertureDevices.set(apertureId, config);
            await project.updateApertureShadingDevices(apertureId, config);
        }

        updateScene();
        this.renderApertureList();
        this.selectAperture(apertureId);
    }

    /**
     * Save fins configuration
     */
    async saveFins(apertureId) {
        const leftEnabled = document.getElementById('left-fin-enabled')?.checked;
        const rightEnabled = document.getElementById('right-fin-enabled')?.checked;

        if (!leftEnabled && !rightEnabled) {
            await this.deleteFins(apertureId);
            return;
        }

        const finConfig = {
            leftFin: leftEnabled ? {
                enabled: true,
                depth: parseFloat(document.getElementById('left-fin-depth')?.value || 1.0),
                heightAbove: parseFloat(document.getElementById('left-fin-height-above')?.value || 0.5),
                heightBelow: parseFloat(document.getElementById('left-fin-height-below')?.value || 0.5),
                tiltAngle: 90
            } : { enabled: false },
            rightFin: rightEnabled ? {
                enabled: true,
                depth: parseFloat(document.getElementById('right-fin-depth')?.value || 1.0),
                heightAbove: parseFloat(document.getElementById('right-fin-height-above')?.value || 0.5),
                heightBelow: parseFloat(document.getElementById('right-fin-height-below')?.value || 0.5),
                tiltAngle: 90
            } : { enabled: false }
        };

        let config = this.apertureDevices.get(apertureId) || { apertureId, overhangs: [], fins: [], shadingControl: null };
        config.fins = [finConfig];
        this.apertureDevices.set(apertureId, config);

        await project.updateApertureShadingDevices(apertureId, config);
        updateScene();
        this.renderApertureList();
        this.selectAperture(apertureId);

        console.log('Fins saved for', apertureId, finConfig);
    }

    /**
     * Delete fins configuration
     */
    async deleteFins(apertureId) {
        let config = this.apertureDevices.get(apertureId);
        if (config) {
            config.fins = [];
            this.apertureDevices.set(apertureId, config);
            await project.updateApertureShadingDevices(apertureId, config);
        }

        updateScene();
        this.renderApertureList();
        this.selectAperture(apertureId);
    }

    /**
     * Save shading control configuration
     */
    async saveShadingControl(apertureId) {
        const enabled = document.getElementById('control-enabled')?.checked;

        if (!enabled) {
            await this.deleteShadingControl(apertureId);
            return;
        }

        const control = {
            shadingType: document.getElementById('shading-type')?.value,
            materialName: document.getElementById('material-name')?.value,
            controlType: document.getElementById('control-type')?.value,
            setpoint1: parseFloat(document.getElementById('control-setpoint1')?.value) || 0,
            setpoint2: document.getElementById('control-setpoint2')?.value ? parseFloat(document.getElementById('control-setpoint2')?.value) : null,
            scheduleName: document.getElementById('control-schedule')?.value,
            glareControlIsActive: document.getElementById('glare-active')?.checked,
            slatControl: document.getElementById('slat-control')?.value,
            slatSchedule: document.getElementById('slat-schedule')?.value
        };

        if (control.shadingType && control.shadingType.includes('Blind') && !control.slatControl) {
            alert('Please select a Slat Angle Control type for blinds.');
            return;
        }

        let config = this.apertureDevices.get(apertureId) || { apertureId, overhangs: [], fins: [], shadingControl: null };
        config.shadingControl = control;
        this.apertureDevices.set(apertureId, config);

        await project.updateApertureShadingDevices(apertureId, config);
        this.renderApertureList();
        this.selectAperture(apertureId);

        console.log('Shading control saved for', apertureId, control);
    }

    async deleteShadingControl(apertureId) {
        let config = this.apertureDevices.get(apertureId);
        if (config) {
            config.shadingControl = null;
            this.apertureDevices.set(apertureId, config);
            await project.updateApertureShadingDevices(apertureId, config);
        }

        this.renderApertureList();
        this.selectAperture(apertureId);
    }

    /**
     * Select an aperture programmatically (e.g. from 3D view)
     */
    selectApertureById(apertureId) {
        if (!apertureId) return;

        // If the aperture list is empty/stale, refresh it first
        const aperture = getApertureById(apertureId);
        if (aperture && !document.querySelector(`.aperture-list-item[data-aperture-id="${apertureId}"]`)) {
            this.refresh();
        }

        // Ensure the panel is visible/ready (handled by caller usually, but good to check)
        // Select it
        this.selectAperture(apertureId);

        // Scroll into view
        setTimeout(() => {
            const item = document.querySelector(`.aperture-list-item[data-aperture-id="${apertureId}"]`);
            if (item) {
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 50);
    }
}
