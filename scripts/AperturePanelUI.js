/**
 * @file AperturePanelUI.js
 * @description Manages the Apertures panel for configuring windows on walls.
 * Supports multi-wall selection (Ctrl+Click), bulk apply, and per-wall configuration.
 */

import { setupDOM } from './dom.js'; // Import setupDOM

export class AperturePanelUI {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.selectedWalls = new Set(); // Set for multi-select
        this.isLocked = false;
        this.currentCategory = 'selection'; // Default category

        // Categories for the sidebar
        this.categories = [
            { id: 'selection', label: 'Wall Selection' },
            { id: 'north', label: 'North Wall' },
            { id: 'south', label: 'South Wall' },
            { id: 'east', label: 'East Wall' },
            { id: 'west', label: 'West Wall' },
            { id: 'frames', label: 'Frame Settings' }
        ];

        this.wallData = {
            n: { label: 'North', numWindows: 0, mode: 'wwr', wwr: 0.4, sillHeight: 1.0, depthPos: 0.1, winWidth: 1.5, winHeight: 1.2 },
            s: { label: 'South', numWindows: 0, mode: 'wwr', wwr: 0.4, sillHeight: 1.0, depthPos: 0.1, winWidth: 1.5, winHeight: 1.2 },
            e: { label: 'East', numWindows: 0, mode: 'wwr', wwr: 0.4, sillHeight: 1.0, depthPos: 0.1, winWidth: 1.5, winHeight: 1.2 },
            w: { label: 'West', numWindows: 0, mode: 'wwr', wwr: 0.4, sillHeight: 1.0, depthPos: 0.1, winWidth: 1.5, winHeight: 1.2 }
        };

        // Map category IDs to wall IDs
        this.categoryToWall = { north: 'n', south: 's', east: 'e', west: 'w' };
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';
        this.container.classList.add('resizable-panel');
        this.container.style.width = '700px';
        this.container.style.height = '550px';

        this.container.innerHTML = `
            <div class="window-header">
                <span>Apertures</span>
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
                    <div style="width: 180px; border-right: 1px solid var(--grid-color); display: flex; flex-direction: column;">
                        <div style="padding: 0.5rem; border-bottom: 1px solid var(--grid-color);">
                            <span class="label">Configuration</span>
                        </div>
                        <div id="aperture-category-list" class="scrollable-panel-inner" style="flex: 1; overflow-y: auto;">
                            <!-- Category items injected here -->
                        </div>
                    </div>

                    <!-- Right Content: Editor -->
                    <div id="aperture-category-editor" style="flex: 1; padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
                        <!-- Content injected here -->
                    </div>
                </div>
            </div>
        `;

        // Setup close button
        const closeButton = this.container.querySelector('.window-icon-close');
        if (closeButton) {
            closeButton.onclick = () => {
                this.container.classList.add('hidden');
                const btn = document.getElementById('toggle-panel-aperture-btn');
                if (btn) btn.classList.remove('active');
            };
        }

        // Render the categories and content
        this.renderCategoryList();
        this.renderAllSections();
        this.selectCategory(this.currentCategory);

        // Refresh the DOM cache since we just injected new inputs
        if (typeof setupDOM === 'function') {
            setupDOM();
        }
    }

    renderCategoryList() {
        const listContainer = this.container.querySelector('#aperture-category-list');
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

    renderAllSections() {
        const editor = this.container.querySelector('#aperture-category-editor');
        if (!editor) return;

        editor.innerHTML = '';

        // Selection section
        editor.appendChild(this.createSelectionSection());

        // Wall sections (North, South, East, West)
        ['n', 's', 'e', 'w'].forEach(wallId => {
            editor.appendChild(this.createWallSection(wallId));
        });

        // Frames section
        editor.appendChild(this.createFramesSection());
    }

    createSelectionSection() {
        const section = document.createElement('div');
        section.id = 'aperture-section-selection';
        section.className = 'space-y-4';

        section.innerHTML = `
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2 text-[--text-primary]">Wall Selection</h3>
            
            <div class="bg-[--bg-secondary] rounded-md p-3 border border-[--grid-color]">
                <div class="flex items-center justify-between mb-2">
                     <span class="label text-xs">Selected Walls:</span>
                     <span class="text-[10px] text-[--text-secondary]">(Click to remove)</span>
                </div>
                
                <div id="selected-wall-container" class="flex flex-wrap gap-2 min-h-[32px] p-1">
                    <span class="text-xs text-[--text-secondary] italic self-center">No walls selected</span>
                </div>

                <div class="flex gap-2 mt-3 pt-3 border-t border-[--grid-color]">
                    <button id="select-all-walls-btn" class="btn flex-1 text-xs py-1.5 bg-[--panel-bg] hover:bg-[--hover-bg] border border-[--grid-color]">Select All</button>
                    <button id="clear-wall-selection-btn" class="btn flex-1 text-xs py-1.5 bg-[--panel-bg] hover:bg-[--hover-bg] border border-[--grid-color]">Clear</button>
                </div>
            </div>
            
            <button id="wall-select-lock-btn" class="btn w-full flex items-center justify-center gap-2 py-2 mt-2" disabled>
                <svg id="lock-icon-unlocked" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
                <svg id="lock-icon-locked" class="hidden" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                <span id="lock-btn-text" class="text-xs">Lock Selection</span>
            </button>
            
            <!-- Bulk Apply Section - shown when locked with 2+ walls -->
            <div id="bulk-apply-section" class="hidden mt-4 p-3 border border-[--accent-color] rounded-lg bg-[--accent-color]/5 space-y-4">
                <h4 class="font-semibold text-xs uppercase text-[--accent-color] flex items-center gap-2">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    Bulk Apply
                </h4>
                
                <div>
                    <label class="label">Mode</label>
                    <div class="btn-group mt-1 w-full flex">
                        <button id="bulk-mode-wwr-btn" class="btn active flex-1">WWR</button>
                        <button id="bulk-mode-manual-btn" class="btn flex-1">Manual</button>
                    </div>
                </div>
                
                ${this.createRangeControlHTML('bulk-win-count', '# of Windows', 0, 10, 0, 1)}
                ${this.createRangeControlHTML('bulk-wwr', 'WWR (%)', 0, 0.99, 0.4, 0.01, '%', true)}
                ${this.createRangeControlHTML('bulk-sill-height', 'Sill Height (m)', 0, 10, 1.0, 0.05, 'm')}
                
                <button id="apply-bulk-btn" class="btn w-full bg-[--accent-color] text-white hover:bg-[--accent-color]/80 shadow-md transition-all py-2 text-xs font-semibold">
                    Apply to <span id="bulk-apply-count">0</span> Walls
                </button>
            </div>
        `;

        // Event listeners for selection section
        section.querySelector('#select-all-walls-btn').addEventListener('click', () => {
            this.selectedWalls = new Set(['n', 's', 'e', 'w']);
            this.updateUI();
            this.dispatchSelectionChange();
        });

        section.querySelector('#clear-wall-selection-btn').addEventListener('click', () => {
            this.selectedWalls.clear();
            this.isLocked = false;
            this.updateUI();
            this.dispatchSelectionChange();
        });

        section.querySelector('#wall-select-lock-btn').addEventListener('click', () => {
            if (this.selectedWalls.size > 0) {
                this.isLocked = !this.isLocked;
                this.updateUI();
            }
        });

        section.querySelector('#bulk-mode-wwr-btn')?.addEventListener('click', () => {
            section.querySelector('#bulk-mode-wwr-btn').classList.add('active');
            section.querySelector('#bulk-mode-manual-btn').classList.remove('active');
        });

        section.querySelector('#bulk-mode-manual-btn')?.addEventListener('click', () => {
            section.querySelector('#bulk-mode-manual-btn').classList.add('active');
            section.querySelector('#bulk-mode-wwr-btn').classList.remove('active');
        });

        section.querySelector('#apply-bulk-btn')?.addEventListener('click', () => this.applyBulkSettings());

        this.addRangeListeners(section);

        return section;
    }

    createWallSection(wallId) {
        const data = this.wallData[wallId];
        const section = document.createElement('div');
        section.id = `aperture-section-${this.getWallCategoryId(wallId)}`;
        section.className = 'hidden space-y-4';

        section.innerHTML = `
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">${data.label} Wall Apertures</h3>
            
            <div id="aperture-controls-${wallId}" class="space-y-4">
                ${this.createRangeControlHTML(`win-count-${wallId}`, '# of Windows', 0, 10, data.numWindows, 1)}
                
                <div>
                    <label class="label">Mode</label>
                    <div class="btn-group mt-1">
                        <button id="mode-wwr-btn-${wallId}" class="btn ${data.mode === 'wwr' ? 'active' : ''}">WWR</button>
                        <button id="mode-manual-btn-${wallId}" class="btn ${data.mode === 'manual' ? 'active' : ''}">Manual</button>
                    </div>
                </div>
                
                <div id="wwr-controls-${wallId}" class="${data.mode === 'manual' ? 'hidden' : ''} space-y-4">
                    ${this.createRangeControlHTML(`wwr-${wallId}`, 'WWR (%)', 0, 0.99, data.wwr, 0.01, '%', true)}
                    ${this.createRangeControlHTML(`wwr-sill-height-${wallId}`, 'Sill Height (m)', 0, 10, data.sillHeight, 0.05, 'm')}
                    ${this.createRangeControlHTML(`win-depth-pos-${wallId}`, 'Window Depth Position (m)', 0, 0.2, data.depthPos, 0.01, 'm')}
                </div>
                
                <div id="manual-controls-${wallId}" class="${data.mode === 'wwr' ? 'hidden' : ''} space-y-4">
                    ${this.createRangeControlHTML(`win-width-${wallId}`, 'Win. Width (m)', 0.1, 20, data.winWidth, 0.1, 'm')}
                    ${this.createRangeControlHTML(`win-height-${wallId}`, 'Win. Height (m)', 0.1, 10, data.winHeight, 0.1, 'm')}
                    ${this.createRangeControlHTML(`sill-height-${wallId}`, 'Sill Height (m)', 0, 10, data.sillHeight, 0.05, 'm')}
                    ${this.createRangeControlHTML(`win-depth-pos-${wallId}-manual`, 'Window Depth Position (m)', 0, 0.2, data.depthPos, 0.01, 'm')}
                </div>
            </div>
        `;

        // Mode toggle listeners
        section.querySelector(`#mode-wwr-btn-${wallId}`)?.addEventListener('click', () => {
            section.querySelector(`#mode-wwr-btn-${wallId}`).classList.add('active');
            section.querySelector(`#mode-manual-btn-${wallId}`).classList.remove('active');
            section.querySelector(`#wwr-controls-${wallId}`).classList.remove('hidden');
            section.querySelector(`#manual-controls-${wallId}`).classList.add('hidden');
            this.wallData[wallId].mode = 'wwr';
        });

        section.querySelector(`#mode-manual-btn-${wallId}`)?.addEventListener('click', () => {
            section.querySelector(`#mode-manual-btn-${wallId}`).classList.add('active');
            section.querySelector(`#mode-wwr-btn-${wallId}`).classList.remove('active');
            section.querySelector(`#manual-controls-${wallId}`).classList.remove('hidden');
            section.querySelector(`#wwr-controls-${wallId}`).classList.add('hidden');
            this.wallData[wallId].mode = 'manual';
        });

        this.addRangeListeners(section);

        return section;
    }

    getWallCategoryId(wallId) {
        const map = { n: 'north', s: 'south', e: 'east', w: 'west' };
        return map[wallId];
    }

    createFramesSection() {
        const section = document.createElement('div');
        section.id = 'aperture-section-frames';
        section.className = 'hidden space-y-4';

        section.innerHTML = `
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Frame Settings</h3>
            
            <label for="frame-toggle" class="flex items-center cursor-pointer">
                <input type="checkbox" id="frame-toggle" checked>
                <span class="ml-3 text-sm font-normal text-[--text-primary]">Add Frame To All Windows</span>
            </label>
            
            <div id="frame-controls" class="mt-4 space-y-6">
                <!-- FRAME GEOMETRY -->
                <div class="space-y-4">
                    <h4 class="text-xs font-semibold text-[--text-secondary] uppercase tracking-wider">Frame Geometry</h4>
                    ${this.createRangeControlHTML('frame-thick', 'Width (m)', 0.01, 1.0, 0.05, 0.005, 'm')}
                    ${(() => {
                const wallThick = document.getElementById('surface-thickness') ? parseFloat(document.getElementById('surface-thickness').value) : 0.2;
                return this.createRangeControlHTML('frame-depth', 'Thickness (m)', 0.05, wallThick, wallThick, 0.001, 'm');
            })()}
                    ${this.createRangeControlHTML('frame-outside-proj', 'Outside Projection (m)', 0, 1.0, 0.0, 0.005, 'm')}
                    ${this.createRangeControlHTML('frame-inside-proj', 'Inside Projection (m)', 0, 1.0, 0.0, 0.005, 'm')}
                </div>

                <!-- FRAME THERMAL -->
                <div class="space-y-4 border-t border-[--grid-color] pt-4">
                    <h4 class="text-xs font-semibold text-[--text-secondary] uppercase tracking-wider">Frame Thermal</h4>
                    ${this.createRangeControlHTML('frame-conductance', 'Conductance (W/m2-K)', 0.1, 20, 5.0, 0.1, '')}
                    ${this.createRangeControlHTML('frame-glass-edge-ratio', 'Edge/Center Ratio', 0.1, 4.0, 1.0, 0.1, '')}
                    ${this.createRangeControlHTML('frame-solar-abs', 'Solar Absorptance', 0, 1, 0.7, 0.05, '', true)}
                    ${this.createRangeControlHTML('frame-visible-abs', 'Visible Absorptance', 0, 1, 0.7, 0.05, '', true)}
                    ${this.createRangeControlHTML('frame-emissivity', 'Thermal Emissivity', 0.01, 1, 0.9, 0.05, '', true)}
                </div>
                
                <!-- DIVIDER SETTINGS -->
                <div class="space-y-4 border-t border-[--grid-color] pt-4">
                    <h4 class="text-xs font-semibold text-[--text-secondary] uppercase tracking-wider">Divider Settings</h4>
                    <div>
                        <label class="label" for="frame-divider-type">Divider Type</label>
                        <select id="frame-divider-type" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                            <option value="None">None</option>
                            <option value="Divided">Divided</option>
                            <option value="Suspended">Suspended</option>
                        </select>
                    </div>

                    <div id="divider-detailed-controls" class="space-y-4 hidden">
                         ${this.createRangeControlHTML('frame-divider-width', 'Width (m)', 0.005, 0.2, 0.02, 0.005, 'm')}
                         ${this.createRangeControlHTML('frame-divider-horiz', 'Horiz. Dividers', 0, 10, 0, 1, '')}
                         ${this.createRangeControlHTML('frame-divider-vert', 'Vert. Dividers', 0, 10, 0, 1, '')}
                         ${this.createRangeControlHTML('frame-divider-outside-proj', 'Outside Proj. (m)', 0, 0.5, 0.0, 0.005, 'm')}
                         ${this.createRangeControlHTML('frame-divider-inside-proj', 'Inside Proj. (m)', 0, 0.5, 0.0, 0.005, 'm')}
                         ${this.createRangeControlHTML('frame-divider-conductance', 'Conductance (W/m2-K)', 0.1, 20, 5.0, 0.1, '')}
                    </div>
                </div>
            </div>
        `;

        this.addRangeListeners(section);

        // Toggle divider controls visibility
        const divSelect = section.querySelector('#frame-divider-type');
        const divControls = section.querySelector('#divider-detailed-controls');
        if (divSelect && divControls) {
            divSelect.addEventListener('change', () => {
                if (divSelect.value === 'None') {
                    divControls.classList.add('hidden');
                } else {
                    divControls.classList.remove('hidden');
                }

                // Dispatch event because this is not a range input
                this.container.dispatchEvent(new CustomEvent('aperture-change', {
                    bubbles: true,
                    detail: { inputId: 'frame-divider-type', value: divSelect.value }
                }));
            });
        }

        return section;
    }

    selectCategory(categoryId) {
        this.currentCategory = categoryId;

        // Update sidebar styling
        const listItems = this.container.querySelectorAll('#aperture-category-list .list-item');
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
        const sections = this.container.querySelectorAll('[id^="aperture-section-"]');
        sections.forEach(sec => sec.classList.add('hidden'));

        const activeSection = this.container.querySelector(`#aperture-section-${categoryId}`);
        if (activeSection) {
            activeSection.classList.remove('hidden');
        }
    }

    createRangeControlHTML(id, label, min, max, value, step, unit = '', percentMode = false) {
        const displayVal = percentMode ? `${Math.round(value * 100)}%` : `${value}${unit}`;
        return `
            <div>
                <label class="label" for="${id}">${label}</label>
                <div class="flex items-center space-x-3 mt-1">
                    <input type="range" id="${id}" min="${min}" max="${max}" value="${value}" step="${step}" data-percent-mode="${percentMode}" data-unit="${unit}">
                    <span id="${id}-val" class="data-value font-mono w-16 text-left">${displayVal}</span>
                </div>
            </div>`;
    }

    addRangeListeners(container) {
        container.querySelectorAll('input[type="range"]').forEach(input => {
            const span = container.querySelector(`#${input.id}-val`);
            if (span) {
                input.addEventListener('input', () => {
                    const v = parseFloat(input.value);
                    const isPercent = input.dataset.percentMode === 'true';
                    const unit = input.dataset.unit || '';
                    span.textContent = isPercent ? `${Math.round(v * 100)}%` : `${v}${unit}`;

                    // Dispatch custom event for geometry updates
                    this.container.dispatchEvent(new CustomEvent('aperture-change', {
                        bubbles: true,
                        detail: { inputId: input.id, value: v }
                    }));
                });
            }
        });
    }

    applyBulkSettings() {
        const section = this.container.querySelector('#aperture-section-selection');
        const isWWR = section.querySelector('#bulk-mode-wwr-btn').classList.contains('active');
        const numWindows = parseInt(section.querySelector('#bulk-win-count').value, 10);
        const wwr = parseFloat(section.querySelector('#bulk-wwr').value);
        const sillHeight = parseFloat(section.querySelector('#bulk-sill-height').value);

        this.selectedWalls.forEach(wallId => {
            const data = this.wallData[wallId];
            data.numWindows = numWindows;
            data.mode = isWWR ? 'wwr' : 'manual';
            data.wwr = wwr;
            data.sillHeight = sillHeight;

            // Update the per-wall UI
            this.updateWallSectionUI(wallId);
        });

        // Dispatch event to update geometry
        this.container.dispatchEvent(new CustomEvent('bulk-aperture-apply', {
            bubbles: true,
            detail: { walls: Array.from(this.selectedWalls) }
        }));
    }

    updateWallSectionUI(wallId) {
        const data = this.wallData[wallId];
        const catId = this.getWallCategoryId(wallId);
        const section = this.container.querySelector(`#aperture-section-${catId}`);
        if (!section) return;

        // Update slider values
        this.setSliderValue(section, `win-count-${wallId}`, data.numWindows);
        this.setSliderValue(section, `wwr-${wallId}`, data.wwr, true);
        this.setSliderValue(section, `wwr-sill-height-${wallId}`, data.sillHeight, false, 'm');
    }

    setSliderValue(container, id, value, isPercent = false, unit = '') {
        const slider = container.querySelector(`#${id}`);
        const label = container.querySelector(`#${id}-val`);
        if (slider) slider.value = value;
        if (label) label.textContent = isPercent ? `${Math.round(value * 100)}%` : `${value}${unit}`;
    }

    /**
     * Called by ui.js when a wall is clicked in the 3D scene.
     * @param {string} wallId - The canonical wall ID ('n', 's', 'e', 'w')
     * @param {boolean} ctrlKey - Whether Ctrl was held during click
     */
    handleWallClick(wallId, ctrlKey = false) {
        if (this.isLocked) return;

        if (ctrlKey) {
            if (this.selectedWalls.has(wallId)) {
                this.selectedWalls.delete(wallId);
            } else {
                this.selectedWalls.add(wallId);
            }
        } else {
            this.selectedWalls.clear();
            this.selectedWalls.add(wallId);
        }

        this.updateUI();
        this.dispatchSelectionChange();
    }

    clearSelection() {
        if (this.isLocked) return;
        this.selectedWalls.clear();
        this.updateUI();
        this.dispatchSelectionChange();
    }

    dispatchSelectionChange() {
        this.container.dispatchEvent(new CustomEvent('wall-selection-change', {
            bubbles: true,
            detail: { selectedWalls: Array.from(this.selectedWalls) }
        }));
    }

    updateUI() {
        // Update selected walls display (Chips)
        const container = this.container.querySelector('#selected-wall-container');
        if (container) {
            container.innerHTML = '';
            if (this.selectedWalls.size === 0) {
                container.innerHTML = '<span class="text-xs text-[--text-secondary] italic self-center">No walls selected</span>';
            } else {
                const sortedWalls = Array.from(this.selectedWalls).sort((a, b) => {
                    const order = { 'n': 1, 's': 2, 'e': 3, 'w': 4 };
                    return order[a] - order[b];
                });

                sortedWalls.forEach(wallId => {
                    const data = this.wallData[wallId];
                    const chip = document.createElement('button');
                    chip.className = 'px-2 py-1 bg-[--accent-color] text-white text-xs rounded shadow-sm hover:bg-[--accent-color]/80 flex items-center gap-1 transition-colors';
                    chip.title = 'Click to deselect';
                    chip.innerHTML = `
                        <span>${data.label}</span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    `;
                    chip.onclick = (e) => {
                        e.stopPropagation();
                        this.handleWallClick(wallId, true); // Toggle/Deselect
                    };
                    container.appendChild(chip);
                });
            }
        }

        // Update lock button state
        const lockBtn = this.container.querySelector('#wall-select-lock-btn');
        const lockText = this.container.querySelector('#lock-btn-text');
        const lockedIcon = this.container.querySelector('#lock-icon-locked');
        const unlockedIcon = this.container.querySelector('#lock-icon-unlocked');

        if (lockBtn) {
            lockBtn.disabled = this.selectedWalls.size === 0;
            if (this.selectedWalls.size === 0) {
                lockBtn.classList.remove('bg-[--bg-secondary]', 'text-[--text-secondary]'); // Standard
            } else {
                // lockBtn.classList.add('bg-[--bg-secondary]', 'text-[--text-primary]');
            }

            // Visual feedback for locked state
            if (this.isLocked) {
                lockBtn.classList.add('bg-[--accent-color]', 'text-white');
                lockBtn.classList.remove('bg-[--panel-bg]');
            } else {
                lockBtn.classList.remove('bg-[--accent-color]', 'text-white');
                lockBtn.classList.add('bg-[--panel-bg]');
            }
        }

        if (lockText) lockText.textContent = this.isLocked ? 'Unlock Selection' : 'Lock Selection';
        if (lockedIcon) lockedIcon.classList.toggle('hidden', !this.isLocked);
        if (unlockedIcon) unlockedIcon.classList.toggle('hidden', this.isLocked);

        // Show/hide bulk apply section
        const bulkSection = this.container.querySelector('#bulk-apply-section');
        const bulkCountSpan = this.container.querySelector('#bulk-apply-count');

        if (bulkSection) {
            // Show bulk apply if locked AND at least 1 wall is selected (was 2, but 1 is also valid for consistency)
            bulkSection.classList.toggle('hidden', !this.isLocked || this.selectedWalls.size < 1);
        }
        if (bulkCountSpan) {
            bulkCountSpan.textContent = this.selectedWalls.size;
        }
    }

    getSelectionState() {
        return {
            walls: Array.from(this.selectedWalls),
            isLocked: this.isLocked
        };
    }
}