
import { getDom } from './dom.js';
import { project } from './project.js';
import {
    getConfig,
    setSchedulesCompact,
    setSchedulesTypeLimits,
    setSchedulesDayHourly,
    setSchedulesConstant,
    setSchedulesFile,
    setSchedulesFileShading
} from './energyplusConfigService.js';

let dom;

export function openSchedulesManagerPanel() {
    dom = getDom();
    const panelId = 'panel-energyplus-schedules';
    const btnId = 'toggle-panel-schedules-btn';
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
        panel = createSchedulesManagerPanel();
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

    renderSchedulesList(panel);
}

function createSchedulesManagerPanel() {
    const panel = document.createElement('div');
    panel.id = 'panel-energyplus-schedules';
    panel.className = 'floating-window ui-panel resizable-panel';

    // Reverted to original dimensions
    panel.style.width = '600px';
    panel.style.height = '500px';

    panel.innerHTML = `
        <div class="window-header">
            <span>EnergyPlus Schedules</span>
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
                <!-- Left Sidebar: List of Schedules -->
                <div style="width: 200px; border-right: 1px solid var(--grid-color); display: flex; flex-direction: column;">
                    <div style="padding: 0.5rem; border-bottom: 1px solid var(--grid-color); display: flex; justify-content: space-between; align-items: center;">
                        <span class="label">Schedules</span>
                        <button class="btn btn-xs btn-secondary" id="sched-add-btn" title="Add New Schedule">+</button>
                    </div>
                    <div id="sched-list" class="scrollable-panel-inner" style="flex: 1; overflow-y: auto;">
                        <!-- List items injected here -->
                    </div>
                </div>

                <!-- Right Content: Editor -->
                <div id="sched-editor" style="flex: 1; padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem;">
                    <div class="text-[--text-secondary] text-sm text-center mt-10">Select a schedule to edit or create a new one.</div>
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

    panel.querySelector('#sched-add-btn').addEventListener('click', () => {
        renderScheduleEditor(panel, null, true);
    });

    return panel;
}

function renderSchedulesList(panel) {
    const listContainer = panel.querySelector('#sched-list');
    const { config } = getConfig(project);
    const schedules = config.schedules || {};

    let html = '';

    const renderItem = (name, type, icon) => `
        <div class="sched-item" data-name="${name}" data-type="${type}" style="padding: 0.5rem 0.75rem; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 0.85rem; border-bottom: 1px solid var(--grid-color);">
            <span style="opacity: 0.7;">${icon}</span>
            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</span>
        </div>
    `;

    // TypeLimits
    (schedules.typeLimits || []).forEach(s => {
        html += renderItem(s.name, 'ScheduleTypeLimits', '📏');
    });

    // DayHourly
    (schedules.dayHourly || []).forEach(s => {
        html += renderItem(s.name, 'Schedule:Day:Hourly', '🕒');
    });

    // Compact
    (schedules.compact || []).forEach(s => {
        html += renderItem(s.name, 'Schedule:Compact', '📦');
    });

    // Constant
    (schedules.constant || []).forEach(s => {
        html += renderItem(s.name, 'Schedule:Constant', '➖');
    });

    // File
    (schedules.file || []).forEach(s => {
        html += renderItem(s.name, 'Schedule:File', '📄');
    });

    // File:Shading
    (schedules.fileShading || []).forEach(s => {
        html += renderItem(s.name, 'Schedule:File:Shading', '☂️');
    });

    listContainer.innerHTML = html;

    listContainer.querySelectorAll('.sched-item').forEach(el => {
        el.addEventListener('click', () => {
            // Highlight selection
            listContainer.querySelectorAll('.sched-item').forEach(i => {
                i.style.backgroundColor = '';
                i.style.color = '';
                i.classList.remove('active');
            });
            el.classList.add('active');
            el.style.backgroundColor = 'var(--accent-color)';
            el.style.color = 'white';

            const name = el.getAttribute('data-name');
            const type = el.getAttribute('data-type');
            renderScheduleEditor(panel, { name, type }, false);
        });
    });
}

function renderScheduleEditor(panel, selectedItem, isNew) {
    const editorContainer = panel.querySelector('#sched-editor');
    const { config } = getConfig(project);
    const schedules = config.schedules || {};

    let data = {};
    let type = 'ScheduleTypeLimits'; // Default for new

    if (!isNew && selectedItem) {
        type = selectedItem.type;
        // Find data
        if (type === 'ScheduleTypeLimits') data = schedules.typeLimits.find(s => s.name === selectedItem.name);
        else if (type === 'Schedule:Day:Hourly') data = schedules.dayHourly.find(s => s.name === selectedItem.name);
        else if (type === 'Schedule:Compact') data = schedules.compact.find(s => s.name === selectedItem.name);
        else if (type === 'Schedule:Constant') data = schedules.constant.find(s => s.name === selectedItem.name);
        else if (type === 'Schedule:File') data = schedules.file.find(s => s.name === selectedItem.name);
        else if (type === 'Schedule:File:Shading') data = schedules.fileShading.find(s => s.name === selectedItem.name);
    }

    if (!data && !isNew) {
        editorContainer.innerHTML = '<div class="text-red-400">Error: Schedule not found.</div>';
        return;
    }

    // Common Header
    let html = `
        <div class="space-y-4">
            <div>
                <label class="label">Schedule Type</label>
                <select id="sched-type-select" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" ${!isNew ? 'disabled' : ''}>
                    <option value="ScheduleTypeLimits" ${type === 'ScheduleTypeLimits' ? 'selected' : ''}>ScheduleTypeLimits</option>
                    <option value="Schedule:Day:Hourly" ${type === 'Schedule:Day:Hourly' ? 'selected' : ''}>Schedule:Day:Hourly</option>
                    <option value="Schedule:Compact" ${type === 'Schedule:Compact' ? 'selected' : ''}>Schedule:Compact</option>
                    <option value="Schedule:Constant" ${type === 'Schedule:Constant' ? 'selected' : ''}>Schedule:Constant</option>
                    <option value="Schedule:File" ${type === 'Schedule:File' ? 'selected' : ''}>Schedule:File</option>
                    <option value="Schedule:File:Shading" ${type === 'Schedule:File:Shading' ? 'selected' : ''}>Schedule:File:Shading</option>
                </select>
            </div>
            
            <div>
                <label class="label">Name</label>
                <input type="text" id="sched-name" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${data.name || ''}" ${!isNew ? 'readonly' : ''}>
            </div>
    `;

    // Dynamic Fields based on Type
    html += `<div id="sched-dynamic-fields" class="space-y-4 mt-4">`;
    html += getFieldsForType(type, data, schedules);
    html += `</div>`;

    // Actions
    html += `
            <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-[--grid-color]">
                ${!isNew ? '<button class="btn btn-sm btn-danger" id="sched-delete-btn">Delete</button>' : ''}
                <button class="btn btn-sm btn-primary" id="sched-save-btn">Save</button>
            </div>
        </div>
    `;

    editorContainer.innerHTML = html;

    // Event Listeners
    if (isNew) {
        const typeSelect = editorContainer.querySelector('#sched-type-select');
        typeSelect.addEventListener('change', (e) => {
            const newType = e.target.value;
            editorContainer.querySelector('#sched-dynamic-fields').innerHTML = getFieldsForType(newType, {}, schedules);
            setupDynamicListeners(editorContainer, newType);
        });
    }

    setupDynamicListeners(editorContainer, type);

    editorContainer.querySelector('#sched-save-btn').addEventListener('click', () => {
        saveSchedule(panel, isNew, selectedItem ? selectedItem.name : null);
    });

    if (!isNew) {
        editorContainer.querySelector('#sched-delete-btn').addEventListener('click', () => {
            if (confirm(`Are you sure you want to delete ${selectedItem.name}?`)) {
                deleteSchedule(panel, selectedItem.type, selectedItem.name);
            }
        });
    }
}

function setupDynamicListeners(container, type) {
    // File Picker Handlers
    if (type === 'Schedule:File' || type === 'Schedule:File:Shading') {
        const browseBtn = container.querySelector('.browse-file-btn');
        const fileInput = container.querySelector('.file-path-input');

        if (browseBtn && fileInput) {
            browseBtn.addEventListener('click', async () => {
                if (window.electronAPI && window.electronAPI.openFile) {
                    const filePath = await window.electronAPI.openFile();
                    if (filePath) {
                        fileInput.value = filePath;
                    }
                } else {
                    alert('File picker not available in this environment.');
                }
            });
        }
    }

    // Compact Schedule Builder Handlers
    if (type === 'Schedule:Compact') {
        const builderContainer = container.querySelector('#compact-builder-rows');
        const addBtn = container.querySelector('#add-compact-row-btn');

        if (addBtn && builderContainer) {
            addBtn.addEventListener('click', () => {
                const row = createCompactRow();
                builderContainer.appendChild(row);
            });
        }

        // Delegate delete events
        if (builderContainer) {
            builderContainer.addEventListener('click', (e) => {
                if (e.target.closest('.delete-row-btn')) {
                    e.target.closest('.compact-row').remove();
                }
            });
        }
    }
}

function getFieldsForType(type, data, allSchedules) {
    const typeLimitsOptions = (allSchedules.typeLimits || []).map(tl => `<option value="${tl.name}" ${data.typeLimits === tl.name ? 'selected' : ''}>${tl.name}</option>`).join('');
    const typeLimitsSelect = `
        <div>
            <label class="label">Schedule Type Limits Name</label>
            <select id="sched-typelimits" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                <option value="">-- Select Type Limits --</option>
                ${typeLimitsOptions}
            </select>
        </div>
    `;

    if (type === 'ScheduleTypeLimits') {
        return `
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="label">Lower Limit Value</label>
                    <input type="number" step="any" id="stl-lower" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${data.lowerLimit !== undefined ? data.lowerLimit : ''}">
                </div>
                <div>
                    <label class="label">Upper Limit Value</label>
                    <input type="number" step="any" id="stl-upper" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${data.upperLimit !== undefined ? data.upperLimit : ''}">
                </div>
            </div>
            <div>
                <label class="label">Numeric Type</label>
                <select id="stl-numeric" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                    <option value="Continuous" ${data.numericType === 'Continuous' ? 'selected' : ''}>Continuous</option>
                    <option value="Discrete" ${data.numericType === 'Discrete' ? 'selected' : ''}>Discrete</option>
                </select>
            </div>
            <div>
                <label class="label">Unit Type</label>
                <select id="stl-unit" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                    <option value="Dimensionless" ${data.unitType === 'Dimensionless' ? 'selected' : ''}>Dimensionless</option>
                    <option value="Temperature" ${data.unitType === 'Temperature' ? 'selected' : ''}>Temperature</option>
                    <option value="DeltaTemperature" ${data.unitType === 'DeltaTemperature' ? 'selected' : ''}>DeltaTemperature</option>
                    <option value="PrecipitationRate" ${data.unitType === 'PrecipitationRate' ? 'selected' : ''}>PrecipitationRate</option>
                    <option value="Angle" ${data.unitType === 'Angle' ? 'selected' : ''}>Angle</option>
                    <option value="ConvectionCoefficient" ${data.unitType === 'ConvectionCoefficient' ? 'selected' : ''}>ConvectionCoefficient</option>
                    <option value="ActivityLevel" ${data.unitType === 'ActivityLevel' ? 'selected' : ''}>ActivityLevel</option>
                    <option value="Velocity" ${data.unitType === 'Velocity' ? 'selected' : ''}>Velocity</option>
                    <option value="Capacity" ${data.unitType === 'Capacity' ? 'selected' : ''}>Capacity</option>
                    <option value="Power" ${data.unitType === 'Power' ? 'selected' : ''}>Power</option>
                    <option value="Availability" ${data.unitType === 'Availability' ? 'selected' : ''}>Availability</option>
                    <option value="Percent" ${data.unitType === 'Percent' ? 'selected' : ''}>Percent</option>
                    <option value="Control" ${data.unitType === 'Control' ? 'selected' : ''}>Control</option>
                    <option value="Mode" ${data.unitType === 'Mode' ? 'selected' : ''}>Mode</option>
                </select>
            </div>
        `;
    } else if (type === 'Schedule:Day:Hourly') {
        let hoursHtml = '<div class="grid grid-cols-4 gap-2">';
        const values = data.values || Array(24).fill(0);
        for (let i = 0; i < 24; i++) {
            hoursHtml += `
                <div>
                    <label class="label text-[10px]">Hour ${i + 1}</label>
                    <input type="number" step="any" class="w-full mt-1 text-xs sdh-val bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" data-hour="${i}" value="${values[i]}">
                </div>
            `;
        }
        hoursHtml += '</div>';

        return `
            ${typeLimitsSelect}
            <div class="label mt-2">Hourly Values (1-24)</div>
            ${hoursHtml}
        `;
    } else if (type === 'Schedule:Compact') {
        const parsedRows = parseCompactSchedule(data.lines || []);
        const rowsHtml = parsedRows.map(row => getCompactRowHtml(row)).join('');

        return `
            ${typeLimitsSelect}
            <div class="flex justify-between items-center mt-4 mb-2">
                <label class="label">Schedule Fields</label>
                <button class="btn btn-xs btn-secondary" id="add-compact-row-btn">+ Add Field</button>
            </div>
            <div id="compact-builder-rows" class="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                ${rowsHtml}
            </div>
            <div class="text-xs text-[--text-secondary] mt-2">
                Construct the schedule using Through (Date), For (Days), Interpolate (Optional), and Until (Time & Value) fields.
            </div>
        `;
    } else if (type === 'Schedule:Constant') {
        return `
            ${typeLimitsSelect}
            <div>
                <label class="label">Hourly Value</label>
                <input type="number" step="any" id="sconst-val" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${data.value !== undefined ? data.value : ''}">
            </div>
        `;
    } else if (type === 'Schedule:File') {
        return `
            ${typeLimitsSelect}
            <div>
                <label class="label">File Name</label>
                <div class="flex gap-2 mt-1">
                    <input type="text" id="sf-filename" class="w-full file-path-input text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${data.fileName || ''}" placeholder="Select a file...">
                    <button class="btn btn-secondary browse-file-btn">Browse</button>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="label">Column Number</label>
                    <input type="number" id="sf-col" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${data.columnNumber || 1}">
                </div>
                <div>
                    <label class="label">Rows to Skip</label>
                    <input type="number" id="sf-skip" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${data.rowsToSkip || 0}">
                </div>
                <div>
                    <label class="label">Hours of Data</label>
                    <select id="sf-hours" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                        <option value="8760" ${data.hoursOfData == 8760 ? 'selected' : ''}>8760</option>
                        <option value="8784" ${data.hoursOfData == 8784 ? 'selected' : ''}>8784</option>
                    </select>
                </div>
                <div>
                    <label class="label">Column Separator</label>
                    <select id="sf-sep" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                        <option value="Comma" ${data.columnSeparator === 'Comma' ? 'selected' : ''}>Comma</option>
                        <option value="Tab" ${data.columnSeparator === 'Tab' ? 'selected' : ''}>Tab</option>
                        <option value="Space" ${data.columnSeparator === 'Space' ? 'selected' : ''}>Space</option>
                        <option value="Semicolon" ${data.columnSeparator === 'Semicolon' ? 'selected' : ''}>Semicolon</option>
                    </select>
                </div>
                <div>
                    <label class="label">Interpolate</label>
                    <select id="sf-interp" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                        <option value="No" ${data.interpolate === 'No' ? 'selected' : ''}>No</option>
                        <option value="Yes" ${data.interpolate === 'Yes' ? 'selected' : ''}>Yes</option>
                    </select>
                </div>
                <div>
                    <label class="label">Minutes Per Item</label>
                    <input type="number" id="sf-mins" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${data.minutesPerItem || 60}">
                </div>
            </div>
            <div>
                <label class="label">Adjust for Daylight Savings</label>
                <select id="sf-dst" class="w-full mt-1 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                    <option value="Yes" ${data.adjustDST === 'Yes' ? 'selected' : ''}>Yes</option>
                    <option value="No" ${data.adjustDST === 'No' ? 'selected' : ''}>No</option>
                </select>
            </div>
        `;
    } else if (type === 'Schedule:File:Shading') {
        return `
            <div>
                <label class="label">File Name</label>
                <div class="flex gap-2 mt-1">
                    <input type="text" id="sfs-filename" class="w-full file-path-input text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${data.fileName || ''}" placeholder="Select a file...">
                    <button class="btn btn-secondary browse-file-btn">Browse</button>
                </div>
            </div>
        `;
    }
    return '';
}

// --- Compact Schedule Helpers ---

function parseCompactSchedule(lines) {
    // Parses raw lines into structured objects
    // Example: "Through: 12/31" -> { type: 'Through', value: '12/31' }
    const rows = [];
    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        if (trimmed.toLowerCase().startsWith('through:')) {
            rows.push({ type: 'Through', value: trimmed.substring(8).trim() });
        } else if (trimmed.toLowerCase().startsWith('for:')) {
            rows.push({ type: 'For', value: trimmed.substring(4).trim() });
        } else if (trimmed.toLowerCase().startsWith('interpolate:')) {
            rows.push({ type: 'Interpolate', value: trimmed.substring(12).trim() });
        } else if (trimmed.toLowerCase().startsWith('until:')) {
            const parts = trimmed.substring(6).split(',');
            const time = parts[0].trim();
            const val = parts.length > 1 ? parts[1].trim() : '';
            rows.push({ type: 'Until', time, value: val });
        } else {
            // Fallback for unknown lines, treat as comment or generic
            rows.push({ type: 'Unknown', value: trimmed });
        }
    });

    if (rows.length === 0) {
        // Default initial state
        rows.push({ type: 'Through', value: '12/31' });
        rows.push({ type: 'For', value: 'AllDays' });
        rows.push({ type: 'Until', time: '24:00', value: '0' });
    }

    return rows;
}

function getCompactRowHtml(row = { type: 'Through', value: '' }) {
    const typeOptions = ['Through', 'For', 'Interpolate', 'Until'];

    let inputHtml = '';

    if (row.type === 'Through') {
        // Date input (MM/DD)
        inputHtml = `<input type="text" class="compact-value w-full text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${row.value || ''}" placeholder="MM/DD (e.g. 12/31)">`;
    } else if (row.type === 'For') {
        // Dropdown for days
        const dayOptions = ['AllDays', 'Weekdays', 'Weekends', 'Holidays', 'AlOtherDays', 'SummerDesignDay', 'WinterDesignDay', 'Custom'];
        // Check if current value is a combination or custom
        const isStandard = dayOptions.includes(row.value);
        inputHtml = `<input type="text" class="compact-value w-full text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${row.value || 'AllDays'}" list="for-options" placeholder="Select or type days">
                     <datalist id="for-options">
                        ${dayOptions.map(o => `<option value="${o}">`).join('')}
                     </datalist>`;
    } else if (row.type === 'Interpolate') {
        const opts = ['No', 'Average', 'Linear'];
        inputHtml = `<select class="compact-value w-full text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                        ${opts.map(o => `<option value="${o}" ${row.value === o ? 'selected' : ''}>${o}</option>`).join('')}
                     </select>`;
    } else if (row.type === 'Until') {
        // Ensure time is formatted as HH:MM for display
        let timeVal = row.time || '';
        if (timeVal && !timeVal.includes(':') && !isNaN(timeVal)) {
            timeVal = `${timeVal}:00`;
        }

        inputHtml = `
            <div class="flex gap-2">
                <input type="text" class="compact-time w-1/2 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${timeVal}" placeholder="HH:MM (e.g. 17:00)" pattern="([01]?[0-9]|2[0-4]):[0-5][0-9]">
                <input type="number" step="0.01" min="0" max="1" class="compact-val w-1/2 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${row.value || ''}" placeholder="Value (0-1)">
            </div>
        `;
    } else {
        inputHtml = `<input type="text" class="compact-value w-full text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="${row.value || ''}">`;
    }

    return `
        <div class="compact-row grid grid-cols-[100px_1fr_30px] gap-2 items-center bg-black/20 p-1 rounded border border-[--grid-color]">
            <select class="compact-type-select text-xs bg-transparent border-none focus:ring-0 outline-none">
                ${typeOptions.map(t => `<option value="${t}" ${t === row.type ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
            <div class="compact-input-container">
                ${inputHtml}
            </div>
            <button class="btn btn-xxs btn-danger delete-row-btn" title="Remove">×</button>
        </div>
    `;
}

function createCompactRow() {
    const div = document.createElement('div');
    // Default new row is 'Until' since that's most common after setup
    div.innerHTML = getCompactRowHtml({ type: 'Until', time: '', value: '' });

    // Add change listener to swap input type
    const select = div.querySelector('.compact-type-select');
    select.addEventListener('change', (e) => {
        const newType = e.target.value;
        // Re-render just the inner HTML of this row wrapper
        const newHtml = getCompactRowHtml({ type: newType, value: '' });
        // We need to extract just the input container part or replace the whole thing
        // Easier to replace the whole row, but we need to keep the reference in DOM
        const temp = document.createElement('div');
        temp.innerHTML = newHtml;
        div.replaceWith(temp.firstElementChild);

        // Re-attach listener to the new element
        const newSelect = temp.firstElementChild.querySelector('.compact-type-select');
        newSelect.addEventListener('change', (ev) => {
            // Recursion for subsequent changes
            updateCompactRowInput(temp.firstElementChild, ev.target.value);
        });
    });

    // We also need to attach this listener to existing rows rendered via string
    return div.firstElementChild;
}

// Helper to update input container when type changes
function updateCompactRowInput(rowElement, type) {
    const container = rowElement.querySelector('.compact-input-container');
    let inputHtml = '';

    if (type === 'Through') {
        inputHtml = `<input type="text" class="compact-value w-full text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="" placeholder="MM/DD (e.g. 12/31)">`;
    } else if (type === 'For') {
        inputHtml = `<input type="text" class="compact-value w-full text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="AllDays" list="for-options" placeholder="Select or type days">`;
    } else if (type === 'Interpolate') {
        inputHtml = `<select class="compact-value w-full text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none">
                        <option value="No">No</option>
                        <option value="Average">Average</option>
                        <option value="Linear">Linear</option>
                     </select>`;
    } else if (type === 'Until') {
        inputHtml = `
            <div class="flex gap-2">
                <input type="text" class="compact-time w-1/2 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="" placeholder="HH:MM (e.g. 17:00)" pattern="([01]?[0-9]|2[0-4]):[0-5][0-9]">
                <input type="number" step="0.01" min="0" max="1" class="compact-val w-1/2 text-xs bg-black/20 border border-gray-700 rounded p-1.5 focus:border-[--accent-color] focus:ring-1 focus:ring-[--accent-color] outline-none" value="" placeholder="Value (0-1)">
            </div>
        `;
    }
    container.innerHTML = inputHtml;
}

// We need to attach listeners to the initial rendered rows too
// This is done in setupDynamicListeners? No, that's for the container.
// We can use event delegation on the container for the 'change' event of the select.
document.addEventListener('change', (e) => {
    if (e.target.classList.contains('compact-type-select')) {
        const row = e.target.closest('.compact-row');
        if (row) {
            updateCompactRowInput(row, e.target.value);
        }
    }
});


function saveSchedule(panel, isNew, oldName) {
    const editorContainer = panel.querySelector('#sched-editor');
    const type = editorContainer.querySelector('#sched-type-select').value;
    const name = editorContainer.querySelector('#sched-name').value.trim();

    if (!name) {
        alert('Name is required');
        return;
    }

    const { config } = getConfig(project);
    const schedules = config.schedules || {};

    // Helper to update specific schedule list
    const updateList = (listName, newItem) => {
        let list = [...(schedules[listName] || [])];
        if (!isNew && oldName) {
            // Remove old
            list = list.filter(s => s.name !== oldName);
        }
        // Remove any existing with same name (overwrite)
        list = list.filter(s => s.name !== name);
        list.push(newItem);
        return list;
    };

    if (type === 'ScheduleTypeLimits') {
        const newItem = {
            name,
            lowerLimit: parseFloat(editorContainer.querySelector('#stl-lower').value) || '',
            upperLimit: parseFloat(editorContainer.querySelector('#stl-upper').value) || '',
            numericType: editorContainer.querySelector('#stl-numeric').value,
            unitType: editorContainer.querySelector('#stl-unit').value
        };
        setSchedulesTypeLimits(project, updateList('typeLimits', newItem));
    } else if (type === 'Schedule:Day:Hourly') {
        const values = [];
        editorContainer.querySelectorAll('.sdh-val').forEach(el => {
            values.push(parseFloat(el.value) || 0);
        });
        const newItem = {
            name,
            typeLimits: editorContainer.querySelector('#sched-typelimits').value,
            values
        };
        setSchedulesDayHourly(project, updateList('dayHourly', newItem));
    } else if (type === 'Schedule:Compact') {
        // Serialize rows back to lines
        const lines = [];
        editorContainer.querySelectorAll('.compact-row').forEach(row => {
            const type = row.querySelector('.compact-type-select').value;
            if (type === 'Until') {
                let time = row.querySelector('.compact-time').value;
                const val = row.querySelector('.compact-val').value;

                // Format time to HH:MM if it's just a number
                if (time && !time.includes(':')) {
                    time = `${time}:00`;
                }

                if (time) lines.push(`Until: ${time}, ${val}`);
            } else {
                const val = row.querySelector('.compact-value').value;
                if (val) lines.push(`${type}: ${val}`);
            }
        });

        const newItem = {
            name,
            typeLimits: editorContainer.querySelector('#sched-typelimits').value,
            lines
        };
        setSchedulesCompact(project, updateList('compact', newItem));
    } else if (type === 'Schedule:Constant') {
        const newItem = {
            name,
            typeLimits: editorContainer.querySelector('#sched-typelimits').value,
            value: parseFloat(editorContainer.querySelector('#sconst-val').value) || 0
        };
        setSchedulesConstant(project, updateList('constant', newItem));
    } else if (type === 'Schedule:File') {
        const newItem = {
            name,
            typeLimits: editorContainer.querySelector('#sched-typelimits').value,
            fileName: editorContainer.querySelector('#sf-filename').value,
            columnNumber: parseInt(editorContainer.querySelector('#sf-col').value) || 1,
            rowsToSkip: parseInt(editorContainer.querySelector('#sf-skip').value) || 0,
            hoursOfData: parseInt(editorContainer.querySelector('#sf-hours').value) || 8760,
            columnSeparator: editorContainer.querySelector('#sf-sep').value,
            interpolate: editorContainer.querySelector('#sf-interp').value,
            minutesPerItem: parseInt(editorContainer.querySelector('#sf-mins').value) || 60,
            adjustDST: editorContainer.querySelector('#sf-dst').value
        };
        setSchedulesFile(project, updateList('file', newItem));
    } else if (type === 'Schedule:File:Shading') {
        const newItem = {
            name,
            fileName: editorContainer.querySelector('#sfs-filename').value
        };
        setSchedulesFileShading(project, updateList('fileShading', newItem));
    }

    renderSchedulesList(panel);
    // Re-open editor for the saved item
    renderScheduleEditor(panel, { name, type }, false);
}

function deleteSchedule(panel, type, name) {
    const { config } = getConfig(project);
    const schedules = config.schedules || {};

    if (type === 'ScheduleTypeLimits') {
        setSchedulesTypeLimits(project, (schedules.typeLimits || []).filter(s => s.name !== name));
    } else if (type === 'Schedule:Day:Hourly') {
        setSchedulesDayHourly(project, (schedules.dayHourly || []).filter(s => s.name !== name));
    } else if (type === 'Schedule:Compact') {
        setSchedulesCompact(project, (schedules.compact || []).filter(s => s.name !== name));
    } else if (type === 'Schedule:Constant') {
        setSchedulesConstant(project, (schedules.constant || []).filter(s => s.name !== name));
    } else if (type === 'Schedule:File') {
        setSchedulesFile(project, (schedules.file || []).filter(s => s.name !== name));
    } else if (type === 'Schedule:File:Shading') {
        setSchedulesFileShading(project, (schedules.fileShading || []).filter(s => s.name !== name));
    }

    renderSchedulesList(panel);
    panel.querySelector('#sched-editor').innerHTML = '<div class="text-[--text-secondary] text-sm text-center mt-10">Select a schedule to edit or create a new one.</div>';
}
