// scripts/project.js

import * as THREE from 'three';
import { updateScene } from './geometry.js';
import { recreateSimulationPanels } from './simulation.js';
import { getRecipeById } from './recipes/RecipeRegistry.js';
import { getActiveRecipeSelection, buildRecipeConfig } from './recipes/configMappers.js';

class Project {
    constructor() {
        this.projectName = 'default-project';
        this.epwFileContent = null;
        this.simulationFiles = {};
        this.dirHandle = null; // For Web File System Access API (browser)
        this.dirPath = null;   // For Node.js fs module path (Electron)
    }

    setEpwData(epwData) {
        this.epwFileContent = epwData;
    }

    addSimulationFile(inputId, fileName, content) {
        if (!fileName || !content) {
            delete this.simulationFiles[inputId];
        } else {
            this.simulationFiles[inputId] = {
                name: fileName,
                content: content
            };
        }
    }

    gatherSimulationParameters() {
        const simParams = {
            global: {},
            recipes: []
        };

        // 1. Gather Global Parameters from the dedicated panel
        const globalPanel = document.querySelector('.floating-window[data-template-id="template-global-sim-params"]');
        if (globalPanel) {
            const panelData = {};
            // Assuming global panel inputs have simple IDs without suffixes
            globalPanel.querySelectorAll('input, select').forEach(input => {
                const key = input.id;
                panelData[key] = (input.type === 'checkbox' || input.type === 'radio') ? input.checked : input.value;
            });
            simParams.global = panelData;
        }

        // 2. Gather parameters from ALL legacy floating recipe panels (backwards compatibility)
        document.querySelectorAll('.floating-window[data-template-id^="template-recipe-"]').forEach(panel => {
            const templateId = panel.dataset.templateId;
            const panelIdSuffix = panel.id.split('-').pop();

            const recipeData = {
                templateId,
                values: {}
            };

            panel.querySelectorAll('input, select').forEach(input => {
                // Reconstruct the original base ID by removing the unique suffix
                const key = input.id.replace(`-${panelIdSuffix}`, '');
                if (!key) return;

                if (input.type === 'file') {
                    // For files, we save a reference; the actual content is saved elsewhere
                    if (this.simulationFiles[key]) {
                        recipeData.values[key] = { name: this.simulationFiles[key].name };
                    } else {
                        recipeData.values[key] = null;
                    }
                } else {
                    recipeData.values[key] =
                        (input.type === 'checkbox' || input.type === 'radio')
                            ? input.checked
                            : input.value;
                }
            });

            if (Object.keys(recipeData.values).length > 0) {
                simParams.recipes.push(recipeData);
            }
        });

        // 3. New canonical: capture the single active recipe from the sidebar container, if present.
        const sidebarContainer = document.querySelector('#recipe-parameters-container');
        const activeTemplateId = sidebarContainer?.dataset?.activeRecipeTemplate;
        const activePanel = sidebarContainer ? sidebarContainer.firstElementChild : null;

        if (activeTemplateId && activePanel) {
            const panelIdSuffix = activePanel.id.split('-').pop();
            const activeValues = {};

            activePanel.querySelectorAll('input, select').forEach(input => {
                const key = input.id.replace(`-${panelIdSuffix}`, '');
                if (!key) return;

                if (input.type === 'file') {
                    if (this.simulationFiles[key]) {
                        activeValues[key] = { name: this.simulationFiles[key].name };
                    } else {
                        activeValues[key] = null;
                    }
                } else {
                    activeValues[key] =
                        (input.type === 'checkbox' || input.type === 'radio')
                            ? input.checked
                            : input.value;
                }
            });

            // Only set activeRecipe if we actually collected something.
            if (Object.keys(activeValues).length > 0) {
                simParams.activeRecipe = {
                    templateId: activeTemplateId,
                    values: activeValues
                };
            }

            // For backwards compatibility, ensure recipes[] contains this active recipe as first entry.
            if (simParams.activeRecipe) {
                // Remove previous entries for this templateId
                simParams.recipes = simParams.recipes.filter(r => r.templateId !== activeTemplateId);
                simParams.recipes.unshift({
                    templateId: activeTemplateId,
                    values: activeValues
                });
            }
        }

        return simParams;
    }

    async gatherAllProjectData() {
        // Import UI module to get access to dom
        const ui = await import('./ui.js');
        const dom = ui.getDom();

        const getValue = (id, parser = val => val) => {
            if (!dom[id]) {
                console.warn(`DOM element with id '${id}' not found`);
                return null;
            }
            const value = dom[id].value;
            if (value === undefined || value === null || value === '') return null;
            try {
                const parsed = parser(value);
                // Check if parseFloat returned NaN
                if (parser === parseFloat && isNaN(parsed)) {
                    console.warn(`Failed to parse numeric value for '${id}': "${value}"`);
                    return null;
                }
                return parsed;
            } catch (error) {
                console.error(`Error parsing value for '${id}':`, error);
                return null;
            }
        };
        const getChecked = (id) => {
            if (!dom[id]) {
                console.warn(`DOM element with id '${id}' not found`);
                return null;
            }
            return dom[id].checked;
        };
        const getTextContent = (id) => {
            if (!dom[id]) {
                console.warn(`DOM element with id '${id}' not found`);
                return null;
            }
            return dom[id].textContent;
        };
        const getClassListContains = (id, className) => {
            if (!dom[id]) {
                console.warn(`DOM element with id '${id}' not found`);
                return false;
            }
            return dom[id].classList.contains(className);
        };

        this.projectName = getValue('project-name') || 'default-project';

        // Import helper functions from UI module
        const { getAllWindowParams, getAllShadingParams, getSavedViews } = ui;

        const projectData = {
            projectInfo: {
                'project-name': this.projectName,
                'project-desc': getValue('project-desc'),
                'building-type': getValue('building-type'),
                'radiance-path': getValue('radiance-path'),
                'latitude': getValue('latitude'),
                'longitude': getValue('longitude'),
                epwFileName: this.epwFileContent ? (getTextContent('epw-file-name') || 'climate.epw') : null,
            },
            geometry: {
                room: {
                    width: getValue('width', parseFloat),
                    length: getValue('length', parseFloat),
                    height: getValue('height', parseFloat),
                    elevation: getValue('elevation', parseFloat),
                    'room-orientation': getValue('room-orientation', parseFloat),
                },
                mode: dom['mode-import-btn']?.classList.contains('active') ? 'imported' : 'parametric',
                apertures: getAllWindowParams(),
                // NEW: Aperture metadata from geometry registry
                apertureMetadata: (async () => {
                    const { getAllApertures } = await import('./geometry.js');
                    return getAllApertures(); // Returns array of aperture objects with IDs, positions, dimensions
                })(),
                // NEW: Shading devices attached to apertures
                shadingDevices: await this.getApertureShadingDevices(),
                shading: getAllShadingParams(),
                frames: {
                    enabled: getChecked('frame-toggle'),
                    // Geometry
                    width: getValue('frame-thick', parseFloat), // Maps to 'Frame Width'
                    outsideProjection: getValue('frame-outside-proj', parseFloat),
                    insideProjection: getValue('frame-inside-proj', parseFloat),
                    // Thermal
                    conductance: getValue('frame-conductance', parseFloat),
                    ratio: getValue('frame-glass-edge-ratio', parseFloat),
                    solarAbsorptance: getValue('frame-solar-abs', parseFloat),
                    visibleAbsorptance: getValue('frame-visible-abs', parseFloat),
                    emissivity: getValue('frame-emissivity', parseFloat),
                    // Dividers
                    dividerType: getValue('frame-divider-type'),
                    dividerWidth: getValue('frame-divider-width', parseFloat),
                    dividerHorizontal: getValue('frame-divider-horiz', parseFloat),
                    dividerVertical: getValue('frame-divider-vert', parseFloat),
                    dividerOutsideProjection: getValue('frame-divider-outside-proj', parseFloat),
                    dividerInsideProjection: getValue('frame-divider-inside-proj', parseFloat),
                    dividerConductance: getValue('frame-divider-conductance', parseFloat),
                    thickness: getValue('frame-depth', parseFloat)
                },
                furniture: (async () => {
                    const { furnitureObject } = await import('./geometry.js');
                    const furnitureData = [];
                    // The container is now guaranteed to be the first child.
                    if (furnitureObject.children.length > 0 && furnitureObject.children[0].children) {
                        const furnitureContainer = furnitureObject.children[0];
                        furnitureContainer.children.forEach(obj => {
                            furnitureData.push({
                                assetType: obj.userData.assetType,
                                position: obj.position.toArray(),
                                quaternion: obj.quaternion.toArray(),
                                scale: obj.scale.toArray(),
                            });
                        });
                    }
                    return furnitureData;
                })(),
                vegetation: (async () => {
                    const { vegetationObject } = await import('./geometry.js');
                    const vegetationData = [];
                    if (vegetationObject.children.length > 0 && vegetationObject.children[0].children) {
                        const vegetationContainer = vegetationObject.children[0];
                        vegetationContainer.children.forEach(obj => {
                            vegetationData.push({
                                assetType: obj.userData.assetType,
                                position: obj.position.toArray(),
                                quaternion: obj.quaternion.toArray(),
                                scale: obj.scale.toArray(),
                            });
                        });
                    }
                    return vegetationData;
                })(),
                contextMassing: (async () => {
                    const { contextObject } = await import('./geometry.js');
                    const massingData = [];
                    contextObject.children.forEach(obj => {
                        if (obj.userData.isMassingBlock) {
                            // Combine userData (for geometry) with live transform data
                            const dataToSave = {
                                ...obj.userData,
                                position: obj.position.toArray(), // Overwrite userData.position with the live one
                                quaternion: obj.quaternion.toArray(),
                                scale: obj.scale.toArray()
                            };
                            massingData.push(dataToSave);
                        }
                    });
                    return massingData;
                })(),
            },
            materials: (() => {
                const getMaterialData = (type) => {
                    const mode = dom[`${type}-mode-srd`]?.classList.contains('active') ? 'srd' : 'refl';
                    const data = {
                        type: getValue(`${type}-mat-type`),
                        mode: mode,
                        reflectance: getValue(`${type}-refl`, parseFloat),
                        specularity: getValue(`${type}-spec`, parseFloat),
                        roughness: getValue(`${type}-rough`, parseFloat),
                        srdFile: null
                    };
                    if (mode === 'srd' && this.simulationFiles[`${type}-srd-file`]) {
                        data.srdFile = {
                            inputId: `${type}-srd-file`,
                            name: this.simulationFiles[`${type}-srd-file`].name
                        };
                    }
                    return data;
                };

                return {
                    wall: getMaterialData('wall'),
                    floor: getMaterialData('floor'),
                    ceiling: getMaterialData('ceiling'),
                    frame: { type: getValue('frame-mat-type'), reflectance: getValue('frame-refl', parseFloat), specularity: getValue('frame-spec', parseFloat), roughness: getValue('frame-rough', parseFloat) },
                    shading: { type: getValue('shading-mat-type'), reflectance: getValue('shading-refl', parseFloat), specularity: getValue('shading-spec', parseFloat), roughness: getValue('shading-rough', parseFloat) },
                    furniture: { type: getValue('furniture-mat-type'), reflectance: getValue('furniture-refl', parseFloat), specularity: getValue('furniture-spec', parseFloat), roughness: getValue('furniture-rough', parseFloat) },
                    glazing: {
                        transmittance: 0.6, // Default value as UI control is removed
                        bsdfEnabled: getChecked('bsdf-toggle'),
                        bsdfFile: getChecked('bsdf-toggle') && this.simulationFiles['bsdf-file'] ? { inputId: 'bsdf-file', name: this.simulationFiles['bsdf-file'].name } : null
                    },
                };
            })(),
            viewpoint: {
                'view-type': getValue('view-type'), 'gizmo-toggle': getChecked('gizmo-toggle'),
                'view-pos-x': getValue('view-pos-x', parseFloat), 'view-pos-y': getValue('view-pos-y', parseFloat), 'view-pos-z': getValue('view-pos-z', parseFloat),
                'view-dir-x': getValue('view-dir-x', parseFloat), 'view-dir-y': getValue('view-dir-y', parseFloat), 'view-dir-z': getValue('view-dir-z', parseFloat),
                'view-fov': getValue('view-fov', parseFloat), 'view-dist': getValue('view-dist', parseFloat)
            },
            viewOptions: {
                projection: dom['proj-btn-persp']?.classList.contains('active') ? 'perspective' : 'orthographic',
                transparent: getChecked('transparent-toggle'),
                ground: getChecked('ground-plane-toggle'),
                worldAxes: getChecked('world-axes-toggle'),
                worldAxesSize: getValue('world-axes-size', parseFloat),
                hSection: { enabled: getChecked('h-section-toggle'), dist: getValue('h-section-dist', parseFloat) },
                vSection: { enabled: getChecked('v-section-toggle'), dist: getValue('v-section-dist', parseFloat) }
            },
            savedViews: getSavedViews().map(view => ({
                name: view.name,
                thumbnail: view.thumbnail,
                cameraState: {
                    position: view.cameraState.position.toArray(),
                    quaternion: view.cameraState.quaternion.toArray(),
                    zoom: view.cameraState.zoom,
                    target: view.cameraState.target.toArray(),
                    viewType: view.cameraState.viewType,
                    fov: view.cameraState.fov
                }
            })),
            topography: {
                enabled: getChecked('context-mode-topo'),
                heightmapFile: this.simulationFiles['topo-heightmap-file'] ? {
                    inputId: 'topo-heightmap-file',
                    name: this.simulationFiles['topo-heightmap-file'].name
                } : null,
                planeSize: getValue('topo-plane-size', parseFloat),
                verticalScale: getValue('topo-vertical-scale', parseFloat)
            },
            visualization: {
                compareMode: getChecked('compare-mode-toggle'),
                activeView: document.querySelector('#view-mode-selector .btn.active')?.id.replace('view-mode-', '').replace('-btn', '') || 'a',
                scaleMin: getValue('results-scale-min', parseFloat),
                scaleMax: getValue('results-scale-max', parseFloat),
                palette: getValue('results-palette'),
                activeMetric: getValue('metric-selector'),
            },
            occupancy: {
                enabled: getChecked('occupancy-toggle'),
                fileName: getValue('occupancy-schedule-filename'),
                timeStart: getValue('occupancy-time-range-start', parseFloat),
                timeEnd: getValue('occupancy-time-range-end', parseFloat),
                days: (() => {
                    const days = {};
                    const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                    document.querySelectorAll('.occupancy-day').forEach((el, i) => {
                        days[dayMap[i]] = el.checked;
                    });
                    return days;
                })()
            },
            epwFileContent: this.epwFileContent,
            simulationFiles: this.simulationFiles,
            simulationParameters: this.gatherSimulationParameters()
        };

        // Await the promises from the async IIFEs to get the actual data
        projectData.geometry.furniture = await projectData.geometry.furniture;
        projectData.geometry.vegetation = await projectData.geometry.vegetation;
        projectData.geometry.contextMassing = await projectData.geometry.contextMassing;
        projectData.geometry.apertureMetadata = await projectData.geometry.apertureMetadata;

        return projectData;
    }

    /**
     * Get shading devices attached to apertures from metadata.
     * @returns {Promise<Array>} Array of aperture shading device configurations
     */
    async getApertureShadingDevices() {
        // Check if metadata exists and has aperture shading devices
        const metadata = this.metadata || {};
        const shadingConfig = metadata.energyPlusConfig?.shading || {};
        return shadingConfig.apertureDevices || [];
    }

    /**
     * Update shading devices for a specific aperture.
     * @param {string} apertureId - The aperture ID
     * @param {object} devices - Shading device configuration { overhangs, fins, shadingControl }
     */
    async updateApertureShadingDevices(apertureId, devices) {
        // Ensure metadata structure exists
        if (!this.metadata) this.metadata = {};
        if (!this.metadata.energyPlusConfig) this.metadata.energyPlusConfig = {};
        if (!this.metadata.energyPlusConfig.shading) this.metadata.energyPlusConfig.shading = {};
        if (!this.metadata.energyPlusConfig.shading.apertureDevices) {
            this.metadata.energyPlusConfig.shading.apertureDevices = [];
        }

        // Find existing entry for this aperture or create new one
        let apertureEntry = this.metadata.energyPlusConfig.shading.apertureDevices.find(
            entry => entry.apertureId === apertureId
        );

        if (!apertureEntry) {
            apertureEntry = { apertureId, overhangs: [], fins: [], shadingControl: null };
            this.metadata.energyPlusConfig.shading.apertureDevices.push(apertureEntry);
        }

        // Update devices
        if (devices.overhangs) apertureEntry.overhangs = devices.overhangs;
        if (devices.fins) apertureEntry.fins = devices.fins;
        if (devices.shadingControl !== undefined) apertureEntry.shadingControl = devices.shadingControl;
    }

    /**
     * Get shading devices for a specific aperture.
     * @param {string} apertureId - The aperture ID
     * @returns {object|null} Shading device configuration or null
     */
    getApertureShadingById(apertureId) {
        const metadata = this.metadata || {};
        const shadingConfig = metadata.energyPlusConfig?.shading || {};
        const apertureDevices = shadingConfig.apertureDevices || [];
        return apertureDevices.find(entry => entry.apertureId === apertureId) || null;
    }

    async requestProjectDirectory() {
        const { showAlert, getDom } = await import('./ui.js');
        const dom = getDom();

        // --- Electron Environment ---
        if (window.electronAPI) {
            const path = await window.electronAPI.openDirectory();
            if (path) {
                this.dirPath = path;
                this.dirHandle = null; // Clear the handle if we're using a path in Electron
                dom['project-access-prompt']?.classList.add('hidden');
                showAlert(`Project folder set to: ${path}`, 'Directory Set');
                return true;
            }
            return false;
        }

        // --- Browser Environment Fallback (for testing in browser without Electron) ---
        if (!window.showDirectoryPicker) {
            showAlert("Your browser does not support the File System Access API. Please use a modern browser like Chrome or Edge.", "Feature Not Supported");
            return false;
        }
        try {
            const dirHandle = await window.showDirectoryPicker();
            this.dirHandle = dirHandle;
            this.dirPath = null; // Clear the path if we're using a handle
            dom['project-access-prompt']?.classList.add('hidden');
            showAlert('Project folder selected. Future saves will go here directly.', 'Directory Set');
            return true;
        } catch (error) {
            if (error.name !== 'AbortError') console.error("Error selecting directory:", error);
            return false;
        }
    }



    async downloadProjectFile() {
        const { showAlert } = await import('./ui.js');

        // 1. Check for a valid save location (either an Electron path or a Browser handle).
        // If none exists, prompt the user to select one.
        if (!this.dirPath && !this.dirHandle) {
            const gotLocation = await this.requestProjectDirectory();
            // Abort the save if the user cancels the directory selection dialog.
            if (!gotLocation) return;
        }

        try {
            const projectData = await this.gatherAllProjectData();
            const projectName = this.projectName || 'project';

            // Sanitize the project data for JSON serialization by removing large file contents.
            const dataForJson = JSON.parse(JSON.stringify(projectData));
            dataForJson.epwFileContent = null;
            if (dataForJson.simulationFiles) {
                Object.values(dataForJson.simulationFiles).forEach(file => { if (file) file.content = null; });
            }
            const projectJsonContent = JSON.stringify(dataForJson, null, 2);

            // 3. Structure all generated content into a list of file objects.
            let filesToWrite = [
                { path: [`${projectName}.json`], content: projectJsonContent }
            ];

            // Add EPW and other simulation files if needed
            if (projectData.epwFileContent && projectData.projectInfo.epwFileName) {
                filesToWrite.push({ path: ['04_skies', projectData.projectInfo.epwFileName], content: projectData.epwFileContent });
            }
            if (projectData.simulationFiles) {
                for (const key in projectData.simulationFiles) {
                    const fileData = projectData.simulationFiles[key];
                    if (fileData?.name && fileData.content) {
                        const targetDir = key.includes('bsdf') ? '05_bsdf' : key.includes('schedule') ? '10_schedules' : '11_files';
                        filesToWrite.push({ path: [targetDir, fileData.name], content: fileData.content });
                    }
                }
            }
            // Filter out any files that might not have content.
            filesToWrite = filesToWrite.filter(f => f.content !== null && f.content !== undefined);

            // 4. Write the files using the appropriate method based on the environment.
            if (window.electronAPI && this.dirPath) {
                // Electron Method: Send all data to the main process for efficient file writing.
                await window.electronAPI.saveProject({ projectPath: this.dirPath, files: filesToWrite });
            } else if (this.dirHandle) {
                // Browser Method: Use the File System Access API to write files one by one.
                for (const file of filesToWrite) {
                    let currentHandle = this.dirHandle;
                    // Create subdirectories as needed.
                    for (let i = 0; i < file.path.length - 1; i++) {
                        currentHandle = await currentHandle.getDirectoryHandle(file.path[i], { create: true });
                    }
                    const fileHandle = await currentHandle.getFileHandle(file.path[file.path.length - 1], { create: true });
                    const writable = await fileHandle.createWritable();

                    let contentToWrite = file.content;
                    // Safeguard: If content is a plain object, stringify it before writing.
                    if (typeof contentToWrite === 'object' && contentToWrite !== null && !(contentToWrite instanceof Blob) && !(contentToWrite instanceof ArrayBuffer) && !ArrayBuffer.isView(contentToWrite)) {
                        console.warn(`Content for ${file.path.join('/')} was an object. Auto-stringifying.`, contentToWrite);
                        contentToWrite = JSON.stringify(contentToWrite, null, 2);
                    }

                    await writable.write(contentToWrite);
                    await writable.close();
                }
            } else {
                throw new Error("No valid directory path or handle is available for saving.");
            }

            showAlert(`Project '${projectName}' saved successfully.`, 'Project Saved');

        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("Failed to save project:", error);
                showAlert(`Error saving project: ${error.message}`, 'Save Error');
            }
        }
    }







    async loadProject() {
        if (!window.showDirectoryPicker) {
            const { showAlert } = await import('./ui.js');
            showAlert("Your browser does not support the File System Access API, which is required to load project folders. Please use a modern browser like Chrome or Edge.", "Feature Not Supported");
            return;
        }

        try {
            const { showAlert } = await import('./ui.js');
            const dirHandle = await window.showDirectoryPicker();
            this.dirHandle = dirHandle; // Store the directory handle

            let jsonFileHandle;
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                    jsonFileHandle = entry;
                    break;
                }
            }
            if (!jsonFileHandle) throw new Error("No project .json file found in the selected directory.");

            const file = await jsonFileHandle.getFile();
            const settings = JSON.parse(await file.text());

            this.simulationFiles = {};
            this.epwFileContent = null;
            // Clear any existing saved views before loading new ones
            const { loadSavedViews } = await import('./ui.js');
            loadSavedViews([]);

            const readFileContent = async (pathSegments) => {
                try {
                    let currentHandle = dirHandle;
                    for (let i = 0; i < pathSegments.length - 1; i++) {
                        currentHandle = await currentHandle.getDirectoryHandle(pathSegments[i]);
                    }
                    const fileHandle = await currentHandle.getFileHandle(pathSegments[pathSegments.length - 1]);
                    return await (await fileHandle.getFile()).text();
                } catch (e) {
                    console.warn(`Could not read file at path: ${pathSegments.join('/')}`, e);
                    return null;
                }
            };

            const readFileAsBlob = async (pathSegments) => {
                try {
                    let currentHandle = dirHandle;
                    for (let i = 0; i < pathSegments.length - 1; i++) {
                        currentHandle = await currentHandle.getDirectoryHandle(pathSegments[i]);
                    }
                    const fileHandle = await currentHandle.getFileHandle(pathSegments[pathSegments.length - 1]);
                    return await fileHandle.getFile(); // Returns a File object (which is a Blob)
                } catch (e) {
                    console.warn(`Could not read file blob at path: ${pathSegments.join('/')}`, e);
                    return null;
                }
            };

            if (settings.projectInfo?.epwFileName) {
                const content = await readFileContent(['04_skies', settings.projectInfo.epwFileName]);
                if (content) this.setEpwData(content);
            }

            if (settings.simulationFiles) {
                const filePromises = Object.entries(settings.simulationFiles).map(async ([key, fileData]) => {
                    if (fileData?.name) {
                        const targetDir = key.includes('bsdf') ? '05_bsdf' : key.includes('schedule') ? '10_schedules' : '11_files';
                        const content = await readFileContent([targetDir, fileData.name]);
                        if (content) this.addSimulationFile(key, fileData.name, content);
                    }
                });
                // Restore the daylighting schedule file if it was saved with the lighting state
                const lightingScheduleInfo = settings.lighting?.daylighting?.scheduleFile;
                if (lightingScheduleInfo?.name) {
                    const content = await readFileContent(['10_schedules', lightingScheduleInfo.name]);
                    if (content) {
                        this.addSimulationFile('daylighting-availability-schedule', lightingScheduleInfo.name, content);
                    }
                }

                // Load topography heightmap as a Blob
                if (settings.topography?.heightmapFile?.name) {
                    const blob = await readFileAsBlob(['12_topography', settings.topography.heightmapFile.name]);
                    if (blob) {
                        // Store the blob directly, ui.js will create a URL from it
                        this.addSimulationFile('topo-heightmap-file', settings.topography.heightmapFile.name, blob);
                    }
                }

                await Promise.all(filePromises);
            }

            await this.applySettings(settings, showAlert);

            // Hide the initial prompt since a directory is now successfully loaded.
            const { getDom } = await import('./ui.js');
            const dom = getDom();
            dom['project-access-prompt']?.classList.add('hidden');

        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("Failed to load project:", error);
                const { showAlert } = await import('./ui.js');
                showAlert(`Error loading project: ${error.message}`, 'Load Error');
            }
        }
    }

    async applySettings(settings, showAlertCallback) {
        // Dynamically import the UI module ONLY when settings are being applied.
        const ui = await import('./ui.js');
        const dom = ui.getDom(); // Get the dom cache from the loaded module

        // Wait a bit to ensure DOM is fully ready
        await new Promise(resolve => setTimeout(resolve, 100));

        // Define helper functions here, now that `dom` is guaranteed to be available.
        const setValue = (id, value) => {
            if (dom[id] && value !== null && value !== undefined) {
                dom[id].value = value;
                dom[id].dispatchEvent(new Event('input', { bubbles: true }));
                dom[id].dispatchEvent(new Event('change', { bubbles: true }));
            }
        };
        const setChecked = (id, isChecked) => {
            if (dom[id] && isChecked !== null && isChecked !== undefined) {
                dom[id].checked = isChecked;
                dom[id].dispatchEvent(new Event('change', { bubbles: true }));
            }
        };

        // --- Project Info & EPW ---
        Object.keys(settings.projectInfo).forEach(key => setValue(key, settings.projectInfo[key]));
        if (this.epwFileContent) {
            dom['epw-file-name'].textContent = settings.projectInfo.epwFileName || 'climate.epw';
        }

        // --- Geometry & Apertures ---
        if (settings.geometry.mode === 'imported') {
            showAlertCallback("This project uses an imported model. Please re-import the original .obj and .mtl files to continue.", "Model Import Required");
            ui.switchGeometryMode('imported');
        } else {
            ui.switchGeometryMode('parametric');
        }
        Object.keys(settings.geometry.room).forEach(key => setValue(key, settings.geometry.room[key]));
        ['n', 's', 'e', 'w'].forEach(dir => {
            const key = dir.toUpperCase();
            const apertureData = settings.geometry.apertures[key];
            setChecked(`aperture-${dir}-toggle`, !!apertureData);
            if (apertureData) {
                ui.setWindowMode(dir, apertureData.mode, false);
                setValue(`win-count-${dir}`, apertureData.winCount);
                if (apertureData.mode === 'wwr') {
                    setValue(`wwr-${dir}`, apertureData.wwr);
                    setValue(`wwr-sill-height-${dir}`, apertureData.sh);
                } else {
                    setValue(`win-width-${dir}`, apertureData.ww);
                    setValue(`win-height-${dir}`, apertureData.wh);
                    setValue(`sill-height-${dir}`, apertureData.sh);
                }

                // Always set window depth position if aperture data exists
                setValue(`win-depth-pos-${dir}`, apertureData.winDepthPos);
                setValue(`win-depth-pos-${dir}-manual`, apertureData.winDepthPos);
            }
            const shadingData = settings.geometry.shading[key];
            setChecked(`shading-${dir}-toggle`, !!shadingData);
            if (shadingData) {
                setValue(`shading-type-${dir}`, shadingData.type);
                ui.handleShadingTypeChange(dir, false); // This reveals the correct controls panel

                // Handle existing, non-generative shading types
                if (shadingData.overhang) Object.keys(shadingData.overhang).forEach(p => setValue(`overhang-${p}-${dir}`, shadingData.overhang[p]));
                if (shadingData.lightshelf) Object.keys(shadingData.lightshelf).forEach(p => setValue(`lightshelf-${p}-${dir}`, shadingData.lightshelf[p]));
                if (shadingData.louver) Object.keys(shadingData.louver).forEach(p => setValue(`louver-${p}-${dir}`, shadingData.louver[p]));
            }
        });

        // --- Frames & Materials ---
        setChecked('frame-toggle', settings.geometry.frames.enabled);
        setValue('frame-thick', settings.geometry.frames.width || settings.geometry.frames.thickness); // Backwards compat
        setValue('frame-outside-proj', settings.geometry.frames.outsideProjection);
        setValue('frame-inside-proj', settings.geometry.frames.insideProjection);
        setValue('frame-conductance', settings.geometry.frames.conductance);
        setValue('frame-glass-edge-ratio', settings.geometry.frames.ratio);
        setValue('frame-solar-abs', settings.geometry.frames.solarAbsorptance);
        setValue('frame-visible-abs', settings.geometry.frames.visibleAbsorptance);
        setValue('frame-emissivity', settings.geometry.frames.emissivity);
        setValue('frame-divider-type', settings.geometry.frames.dividerType);
        setValue('frame-divider-width', settings.geometry.frames.dividerWidth);
        setValue('frame-divider-horiz', settings.geometry.frames.dividerHorizontal);
        setValue('frame-divider-vert', settings.geometry.frames.dividerVertical);
        setValue('frame-divider-outside-proj', settings.geometry.frames.dividerOutsideProjection);
        setValue('frame-divider-inside-proj', settings.geometry.frames.dividerInsideProjection);
        setValue('frame-divider-conductance', settings.geometry.frames.dividerConductance);
        setValue('frame-depth', settings.geometry.frames.thickness);

        // Trigger visibility update for dividers
        dom['frame-divider-type']?.dispatchEvent(new Event('change'));
        ['wall', 'floor', 'ceiling', 'frame', 'shading', 'glazing', 'furniture'].forEach(type => {
            if (settings.materials[type]) {
                const mat = settings.materials[type];
                if (mat.type) setValue(`${type}-mat-type`, mat.type);
                if (mat.reflectance) setValue(`${type}-refl`, mat.reflectance);
                if (mat.specularity) setValue(`${type}-spec`, mat.specularity);
                if ((type === 'wall' || type === 'floor' || type === 'ceiling') && mat.mode === 'srd') {
                    dom[`${type}-mode-srd`]?.click();
                    if (mat.srdFile?.name && dom[`${type}-srd-file`]) {
                        let display = dom[`${type}-srd-file`].parentElement.querySelector('span[data-file-display-for]');
                        if (display) {
                            display.textContent = mat.srdFile.name;
                            display.title = mat.srdFile.name;
                        }
                    }
                }
                if (mat.roughness) setValue(`${type}-rough`, mat.roughness);
                if (mat.transmittance) setValue(`${type}-trans`, mat.transmittance);
            }
        });
        setChecked('bsdf-toggle', settings.materials.glazing.bsdfEnabled);

        // --- Furniture ---
        if (settings.geometry.furniture && Array.isArray(settings.geometry.furniture)) {
            const { addFurniture, furnitureObject } = await import('./geometry.js');
            // Clear any existing furniture before loading
            while (furnitureObject.children.length > 0) furnitureObject.remove(furnitureObject.children[0]);

            settings.geometry.furniture.forEach(item => {
                const newObj = addFurniture(item.assetType, new THREE.Vector3(0, 0, 0)); // Add at origin first
                if (newObj) {
                    newObj.position.fromArray(item.position);
                    newObj.quaternion.fromArray(item.quaternion);
                    newObj.scale.fromArray(item.scale);
                }
            });
        }

        // --- Context Massing ---
        if (settings.geometry.contextMassing && Array.isArray(settings.geometry.contextMassing)) {
            const { addMassingBlock, contextObject } = await import('./geometry.js');
            // Clear any default or existing massing blocks before loading
            const existingBlocks = contextObject.children.filter(c => c.userData.isMassingBlock);
            existingBlocks.forEach(b => contextObject.remove(b));

            settings.geometry.contextMassing.forEach(item => {
                // Prepare params for addMassingBlock, mapping position array to individual coords
                const params = {
                    ...item, // Pass shape, dimensions, name etc.
                    positionX: item.position[0],
                    positionY: item.position[1],
                    positionZ: item.position[2]
                };

                const newBlock = addMassingBlock(params);
                if (newBlock) {
                    // The position is already set by addMassingBlock from params.
                    // Just need to apply quaternion and scale.
                    newBlock.quaternion.fromArray(item.quaternion);
                    newBlock.scale.fromArray(item.scale);
                }
            });
        }



        // --- Viewpoint ---
        if (settings.viewpoint) {
            const vp = settings.viewpoint;
            Object.keys(vp).forEach(key => {
                if (key !== 'gizmoMode' && key !== 'gizmo-toggle') {
                    setValue(key, vp[key]);
                }
            });
            setChecked('gizmo-toggle', vp['gizmo-toggle']);
        }

        // --- View Options ---
        if (settings.viewOptions) {
            const vo = settings.viewOptions;
            if (vo.projection === 'orthographic') {
                dom['view-btn-ortho']?.click();
            } else {
                dom['view-btn-persp']?.click();
            }
            setChecked('transparent-toggle', vo.transparent);
            setChecked('ground-plane-toggle', vo.ground);
            setChecked('world-axes-toggle', vo.worldAxes);
            setValue('world-axes-size', vo.worldAxesSize);
            if (vo.hSection) { setChecked('h-section-toggle', vo.hSection.enabled); setValue('h-section-dist', vo.hSection.dist); }
            if (vo.vSection) { setChecked('v-section-toggle', vo.vSection.enabled); setValue('v-section-dist', vo.vSection.dist); }
        }

        // --- Sensor Grids ---
        if (settings.sensorGrids) {
            const sg = settings.sensorGrids;
            if (sg.illuminance.floor) {
                const floor = sg.illuminance.floor;
                setChecked('grid-floor-toggle', floor.enabled);
                setValue('floor-grid-spacing', floor.spacing);
                setValue('floor-grid-offset', floor.offset);
                setChecked('show-floor-grid-3d-toggle', floor.showIn3D);
                setChecked('task-area-toggle', floor.isTaskArea);
                if (floor.task) {
                    setValue('task-area-start-x', floor.task.x);
                    setValue('task-area-start-z', floor.task.z);
                    setValue('task-area-width', floor.task.width);
                    setValue('task-area-depth', floor.task.depth);
                }
                setChecked('surrounding-area-toggle', floor.hasSurrounding);
                setValue('surrounding-area-width', floor.surroundingWidth);
            }
            if (sg.illuminance.ceiling) {
                setChecked('grid-ceiling-toggle', sg.illuminance.ceiling.enabled);
                setValue('ceiling-grid-spacing', sg.illuminance.ceiling.spacing);
                setValue('ceiling-grid-offset', sg.illuminance.ceiling.offset);
            }
            if (sg.illuminance.walls) {
                const walls = sg.illuminance.walls;
                setValue('wall-grid-spacing', walls.spacing);
                setValue('wall-grid-offset', walls.offset);
                if (walls.surfaces) {
                    setChecked('grid-north-toggle', walls.surfaces.n);
                    setChecked('grid-south-toggle', walls.surfaces.s);
                    setChecked('grid-east-toggle', walls.surfaces.e);
                    setChecked('grid-west-toggle', walls.surfaces.w);
                }
            }
            if (sg.view) {
                setChecked('view-grid-toggle', sg.view.enabled); setChecked('show-view-grid-3d-toggle', sg.view.showIn3D); setValue('view-grid-spacing', sg.view.spacing);
                setValue('view-grid-offset', sg.view.offset); setValue('view-grid-directions', sg.view.numDirs);
                if (sg.view.startVec && Array.isArray(sg.view.startVec)) {
                    setValue('view-grid-start-vec-x', sg.view.startVec[0]);
                    setValue('view-grid-start-vec-y', sg.view.startVec[1]);
                    setValue('view-grid-start-vec-z', sg.view.startVec[2]);
                }
            }
        }

        // --- Occupancy Schedule ---
        if (settings.occupancy) {
            setChecked('occupancy-toggle', settings.occupancy.enabled);
            setValue('occupancy-schedule-filename', settings.occupancy.fileName);
            setValue('occupancy-time-range-start', settings.occupancy.timeStart);
            setValue('occupancy-time-range-end', settings.occupancy.timeEnd);
            if (settings.occupancy.days) {
                const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                document.querySelectorAll('.occupancy-day').forEach((el, i) => {
                    const dayKey = dayMap[i];
                    if (settings.occupancy.days[dayKey] !== undefined) {
                        el.checked = settings.occupancy.days[dayKey];
                    }
                });
            }
            // Manually trigger the UI update and file generation if enabled
            dom['occupancy-controls']?.classList.toggle('hidden', !settings.occupancy.enabled);
            ui.updateOccupancyTimeRangeDisplay();
            if (settings.occupancy.enabled) {
                ui.generateAndStoreOccupancyCsv();
            }
        }

        // --- Visualization Colors & Analysis Panel State ---
        if (settings.visualization) {
            const viz = settings.visualization;
            // Set simple values first
            setChecked('compare-mode-toggle', viz.compareMode);
            setValue('results-scale-min', viz.scaleMin);
            setValue('results-scale-max', viz.scaleMax);
            setValue('results-palette', viz.palette);
            setValue('metric-selector', viz.activeMetric);

            // Trigger UI updates that depend on these values
            if (dom['compare-mode-toggle']) {
                dom['compare-mode-toggle'].dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (dom['metric-selector']) {
                dom['metric-selector'].dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        // --- Simulation Panels ---
        if (settings.simulationParameters) {
            recreateSimulationPanels(settings.simulationParameters, this.simulationFiles, ui);
        }

        // --- Saved Views ---
        if (settings.savedViews) {
            const viewsToLoad = settings.savedViews.map(view => ({
                ...view,
                cameraState: {
                    position: new THREE.Vector3().fromArray(view.cameraState.position),
                    quaternion: new THREE.Quaternion().fromArray(view.cameraState.quaternion),
                    zoom: view.cameraState.zoom,
                    target: new THREE.Vector3().fromArray(view.cameraState.target),
                    viewType: view.cameraState.viewType,
                    fov: view.cameraState.fov
                }
            }));
            ui.loadSavedViews(viewsToLoad);
        } else {
            ui.loadSavedViews([]); // Clear views if none are in the project file
        }

        // --- Topography ---
        if (settings.topography) {
            if (settings.topography.enabled) {
                dom['context-mode-topo']?.click();
                setValue('topo-plane-size', settings.topography.planeSize);
                setValue('topo-vertical-scale', settings.topography.verticalScale);
                // The file content (as a Blob) is already in `this.simulationFiles`.
                // We need to trigger the geometry creation from the UI handler.
                const topoFile = this.simulationFiles['topo-heightmap-file'];
                if (topoFile && topoFile.content) { // content is a Blob
                    const event = new Event('change');
                    // Simulate a file input change event for ui.js to handle
                    Object.defineProperty(event, 'target', { writable: false, value: { files: [topoFile.content] } });
                    dom['topo-heightmap-file']?.dispatchEvent(event);
                }
            }
        }

        // --- Final UI & Scene Updates ---
        ui.updateAllLabels();
        updateScene();

        // Finally, show the success message
        if (showAlertCallback) {
            showAlertCallback(`Project "${settings.projectInfo['project-name']}" loaded successfully.`, 'Project Loaded');
        }
    }
}

export const project = new Project();
