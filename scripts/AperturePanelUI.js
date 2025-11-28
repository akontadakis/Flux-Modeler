export class AperturePanelUI {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentCategory = 'general'; // Default category

        this.categories = [
            { id: 'general', label: 'General Settings' },
            { id: 'north', label: 'North Facade' },
            { id: 'south', label: 'South Facade' },
            { id: 'east', label: 'East Facade' },
            { id: 'west', label: 'West Facade' }
        ];

        this.orientations = [
            { id: 'n', label: 'North', categoryId: 'north' },
            { id: 's', label: 'South', categoryId: 'south' },
            { id: 'e', label: 'East', categoryId: 'east' },
            { id: 'w', label: 'West', categoryId: 'west' }
        ];
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';

        // Add class for styling if needed, though we reuse generic classes
        this.container.classList.add('resizable-panel');
        // Set initial size if not already set (though CSS/ui.js usually handles this)
        this.container.style.width = '800px';
        this.container.style.height = '600px';

        const header = this.createHeader("Apertures & Shading");
        this.container.appendChild(header);

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'window-content';
        contentWrapper.style.display = 'flex';
        contentWrapper.style.flexDirection = 'column';
        contentWrapper.style.height = '100%';
        contentWrapper.style.overflow = 'hidden';

        // Inner container for Sidebar + Content
        const innerContainer = document.createElement('div');
        innerContainer.style.display = 'flex';
        innerContainer.style.flex = '1';
        innerContainer.style.overflow = 'hidden';

        // 1. Left Sidebar
        const sidebar = document.createElement('div');
        sidebar.style.width = '200px';
        sidebar.style.borderRight = '1px solid var(--grid-color)';
        sidebar.style.display = 'flex';
        sidebar.style.flexDirection = 'column';
        sidebar.innerHTML = `
            <div style="padding: 0.5rem; border-bottom: 1px solid var(--grid-color);">
                <span class="label">Configuration</span>
            </div>
            <div id="aperture-category-list" class="scrollable-panel-inner" style="flex: 1; overflow-y: auto;">
                <!-- Categories injected here -->
            </div>
        `;
        innerContainer.appendChild(sidebar);

        // 2. Right Content Area
        const contentArea = document.createElement('div');
        contentArea.id = 'aperture-category-editor';
        contentArea.style.flex = '1';
        contentArea.style.padding = '1rem';
        contentArea.style.overflowY = 'auto';
        contentArea.style.display = 'flex';
        contentArea.style.flexDirection = 'column';
        contentArea.style.gap = '1rem';
        innerContainer.appendChild(contentArea);

        contentWrapper.appendChild(innerContainer);

        // Append Resize Handles to contentWrapper (or container, but container is better for absolute pos)
        this.appendResizeHandles(contentWrapper);

        this.container.appendChild(contentWrapper);
        this.appendResizeHandles(this.container); // Handles need to be direct children of the floating window

        // Render Categories and Content
        this.renderCategoryList();
        this.renderAllSections(contentArea);

        // Initialize with default category
        this.selectCategory(this.currentCategory);
    }

    createHeader(title) {
        const div = document.createElement('div');
        div.className = 'window-header';
        div.innerHTML = `
            <span>${title}</span>
            <div class="window-controls">
                <div class="window-icon-max"></div>
                <div class="collapse-icon"></div>
                <div class="window-icon-close"></div>
            </div>`;
        return div;
    }

    renderCategoryList() {
        const listContainer = this.container.querySelector('#aperture-category-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        this.categories.forEach(cat => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.dataset.id = cat.id; // For easy selection update
            // Match Thermostats styling
            item.style.cssText = 'padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--grid-color);';
            item.innerHTML = `<div class="text-xs">${cat.label}</div>`;

            item.addEventListener('click', () => {
                this.selectCategory(cat.id);
            });

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

    renderAllSections(parentContainer) {
        // 1. General Section (Wall Selection + Frame Controls)
        const generalDiv = document.createElement('div');
        generalDiv.id = 'aperture-section-general';
        generalDiv.className = 'aperture-section hidden space-y-5';
        generalDiv.appendChild(this.createWallSelectionSection());
        generalDiv.appendChild(this.createFrameControls());
        parentContainer.appendChild(generalDiv);

        // 2. Orientation Sections
        this.orientations.forEach(orient => {
            const section = this.createOrientationSection(orient);
            section.id = `aperture-section-${orient.categoryId}`; // e.g., aperture-section-north
            section.className = 'aperture-section hidden space-y-5'; // Initially hidden
            parentContainer.appendChild(section);
        });
    }

    selectCategory(categoryId) {
        this.currentCategory = categoryId;

        // Update Sidebar Styling
        const listItems = this.container.querySelectorAll('#aperture-category-list .list-item');
        listItems.forEach(item => {
            if (item.dataset.id === categoryId) {
                item.classList.add('active');
                item.style.backgroundColor = 'var(--accent-color)';
                item.style.color = 'white';
            } else {
                item.classList.remove('active');
                item.style.backgroundColor = '';
                item.style.color = '';
            }
        });

        // Show/Hide Content Sections
        const sections = this.container.querySelectorAll('.aperture-section');
        sections.forEach(sec => sec.classList.add('hidden'));

        const activeSection = this.container.querySelector(`#aperture-section-${categoryId}`);
        if (activeSection) {
            activeSection.classList.remove('hidden');
        }
    }

    createWallSelectionSection() {
        const div = document.createElement('div');
        div.className = 'space-y-2 pb-3';
        div.innerHTML = `
            <h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">Wall Selection</h3>
            <p class="info-box !text-xs !py-2 !px-3">Click a wall in the 3D view to select it.</p>
            <div class="flex justify-between items-center pt-2">
                <span class="label">Selected Wall:</span>
                <div id="wall-selection-status" class="flex items-center gap-3">
                    <span id="selected-wall-display" class="data-value font-mono">None</span>
                    <button id="wall-select-lock-btn" class="hidden" aria-label="Lock wall selection">
                        <svg id="lock-icon-unlocked" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
                        <svg id="lock-icon-locked" class="hidden" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    </button>
                </div>
            </div>`;
        return div;
    }

    createOrientationSection(orient) {
        const suffix = orient.id;
        const container = document.createElement('div');
        // NOTE: We do NOT set an ID here that conflicts with the section wrapper ID.
        // The wrapper handles visibility. This is just the content.
        // However, the original code used `aperture-controls-${suffix}` for visibility toggling.
        // We will keep that ID on a wrapper inside this section if needed, OR just put the content directly.
        // Let's keep the ID `aperture-controls-${suffix}` on the inner container so existing logic *could* find it,
        // but we will override the visibility logic to use the parent section.
        // Actually, existing logic uses `aperture-controls-${dir}` to toggle visibility.
        // We should probably allow that logic to continue working, OR update it.
        // Since we are refactoring `ui.js` too, we can change how it works.
        // Let's make this container the one that holds the controls.

        container.id = `aperture-controls-${suffix}`; // Kept for reference/compatibility if needed
        container.className = 'space-y-5'; // Removed 'hidden' and border-t, handled by parent section

        container.innerHTML = `<h3 class="font-semibold text-sm uppercase border-b border-[--grid-color] pb-2">${orient.label} Wall Apertures</h3>`;

        container.appendChild(this.createRangeControl(`win-count-${suffix}`, '# of Windows', 0, 10, 0, 1));

        const modeDiv = document.createElement('div');
        modeDiv.innerHTML = `
            <label class="label">Mode</label>
            <div class="btn-group mt-1">
                <button id="mode-wwr-btn-${suffix}" class="btn active">WWR</button>
                <button id="mode-manual-btn-${suffix}" class="btn">Manual</button>
            </div>`;
        container.appendChild(modeDiv);

        const wwrContainer = document.createElement('div');
        wwrContainer.id = `wwr-controls-${suffix}`;
        wwrContainer.className = 'space-y-5';
        wwrContainer.appendChild(this.createRangeControl(`wwr-${suffix}`, 'WWR (%)', 0, 0.99, 0.4, 0.01, '%', true));
        wwrContainer.appendChild(this.createRangeControl(`wwr-sill-height-${suffix}`, 'Sill Height (m)', 0, 10, 1.0, 0.05, 'm'));
        wwrContainer.appendChild(this.createRangeControl(`win-depth-pos-${suffix}`, 'Window Depth Position (m)', 0, 0.2, 0.1, 0.01, 'm'));
        container.appendChild(wwrContainer);

        const manualContainer = document.createElement('div');
        manualContainer.id = `manual-controls-${suffix}`;
        manualContainer.className = 'hidden space-y-5';
        manualContainer.appendChild(this.createRangeControl(`win-width-${suffix}`, 'Win. Width (m)', 0.1, 20, 1.5, 0.1, 'm'));
        manualContainer.appendChild(this.createRangeControl(`win-height-${suffix}`, 'Win. Height (m)', 0.1, 10, 1.2, 0.1, 'm'));
        manualContainer.appendChild(this.createRangeControl(`sill-height-${suffix}`, 'Sill Height (m)', 0, 10, 1.0, 0.05, 'm'));
        manualContainer.appendChild(this.createRangeControl(`win-depth-pos-${suffix}-manual`, 'Window Depth Position (m)', 0, 0.2, 0.1, 0.01, 'm'));
        container.appendChild(manualContainer);

        return container;
    }



    createFrameControls() {
        const div = document.createElement('div');
        div.className = 'pt-4 border-t border-[--grid-color]';
        div.innerHTML = `
            <label for="frame-toggle" class="flex items-center cursor-pointer">
                <input type="checkbox" id="frame-toggle" checked>
                <span class="ml-3 text-sm font-normal text-[--text-primary]">Add Frame To All Windows</span>
            </label>
            <div id="frame-controls" class="mt-4 space-y-2"></div>`;

        const controls = div.querySelector('#frame-controls');
        controls.appendChild(this.createRangeControl('frame-thick', 'Frame Thick. (m)', 0, 1, 0.01, 0.01, 'm'));
        controls.appendChild(this.createRangeControl('frame-depth', 'Frame Depth (m)', 0, 1, 0.05, 0.01, 'm'));

        // Added Divider Type control
        const dividerDiv = document.createElement('div');
        dividerDiv.className = 'mt-2';
        dividerDiv.innerHTML = `
            <label class="label" for="frame-divider-type">Divider Type</label>
            <select id="frame-divider-type" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                <option value="Divided">Divided</option>
                <option value="Suspended">Suspended</option>
            </select>`;
        controls.appendChild(dividerDiv);

        return div;
    }

    createRangeControl(id, label, min, max, value, step, unit = '', percentMode = false) {
        const wrapper = document.createElement('div');
        const displayVal = percentMode ? `${Math.round(value * 100)}%` : `${value}${unit}`;

        wrapper.innerHTML = `
            <label class="label" for="${id}">${label}</label>
            <div class="flex items-center space-x-3 mt-1">
                <input type="range" id="${id}" min="${min}" max="${max}" value="${value}" step="${step}">
                <span id="${id}-val" class="data-value font-mono w-12 text-left">${displayVal}</span>
            </div>`;

        const input = wrapper.querySelector('input');
        const span = wrapper.querySelector('span');
        input.addEventListener('input', (e) => {
            let v = parseFloat(e.target.value);
            span.textContent = percentMode ? `${Math.round(v * 100)}%` : `${v}${unit}`;
        });

        return wrapper;
    }

    appendResizeHandles(targetElement) {
        const positions = ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
        positions.forEach(pos => {
            const div = document.createElement('div');
            div.className = pos.includes('-') ? `resize-handle-corner ${pos}` : `resize-handle-edge ${pos}`;
            targetElement.appendChild(div);
        });
    }
}