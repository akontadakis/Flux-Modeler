// scripts/geometry.js

import * as THREE from 'three';
import { renderer, horizontalClipPlane, verticalClipPlane, sensorTransformControls, importedModelObject } from './scene.js';
import { getAllWindowParams, getAllShadingParams, validateInputs, getWindowParamsForWall, scheduleUpdate } from './ui.js';
import { getDom } from './dom.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { resultsManager } from './resultsManager.js';
import { project } from './project.js';

/**
 * Surface type classification system for ray interaction behavior.
 */
const SURFACE_TYPES = {
    EXTERIOR_WALL: 'EXTERIOR_WALL',
    EXTERIOR_CEILING: 'EXTERIOR_CEILING',
    EXTERIOR_FLOOR: 'EXTERIOR_FLOOR',
    INTERIOR_WALL: 'INTERIOR_WALL',
    INTERIOR_CEILING: 'INTERIOR_CEILING',
    INTERIOR_FLOOR: 'INTERIOR_FLOOR',
    GLAZING: 'GLAZING',
    FRAME: 'FRAME',
    SHADING_DEVICE: 'SHADING_DEVICE'
};

// --- GEOMETRY GROUPS ---
export const roomObject = new THREE.Group();
export const shadingObject = new THREE.Group();

export const resizeHandlesObject = new THREE.Group();
export const wallSelectionGroup = new THREE.Group(); // Group for selectable walls
export const axesObject = new THREE.Group();
export const groundObject = new THREE.Group();
export const northArrowObject = new THREE.Group();
export const furnitureObject = new THREE.Group();
const furnitureContainer = new THREE.Group();
furnitureObject.add(furnitureContainer);

export const contextObject = new THREE.Group();
export const vegetationObject = new THREE.Group();
const vegetationContainer = new THREE.Group();
vegetationObject.add(vegetationContainer);

const siteShadingContextGroup = new THREE.Group();
contextObject.add(siteShadingContextGroup);


const taskAreaHelpersGroup = new THREE.Group();

// --- MODULE STATE & SHARED RESOURCES ---
export let currentImportedModel = null;

export let importedShadingObjects = []; // Store references to imported OBJ meshes for selection

// Context Object Management System
export let contextObjects = new Map(); // Store context objects with unique IDs
let nextContextObjectId = 1;

// Aperture Tracking System
// Stores metadata for all windows/apertures created in the scene
const apertureRegistry = new Map(); // Map<apertureId, apertureMetadata>

/**
 * Get all registered apertures
 * @returns {Array<object>} Array of aperture metadata objects
 */
export function getAllApertures() {
    return Array.from(apertureRegistry.values());
}

/**
 * Get a specific aperture by ID
 * @param {string} apertureId - The unique aperture identifier
 * @returns {object|null} Aperture metadata or null if not found
 */
export function getApertureById(apertureId) {
    return apertureRegistry.get(apertureId) || null;
}

/**
 * Register an aperture in the registry
 * @param {object} apertureMetadata - Complete metadata for the aperture
 * @private
 */
function registerAperture(apertureMetadata) {
    if (!apertureMetadata || !apertureMetadata.id) {
        console.warn('[registerAperture] Invalid aperture metadata:', apertureMetadata);
        return;
    }
    apertureRegistry.set(apertureMetadata.id, apertureMetadata);
}

/**
 * Clear the aperture registry (called when geometry is rebuilt)
 * @private
 */
function clearApertureRegistry() {
    apertureRegistry.clear();
}

const highlightMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--highlight-color').trim() || '#3b82f6'),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5,
    depthTest: false // Ensure highlight is always visible
});
let highlightedWalls = []; // Array of { object, originalMaterial } for multi-select

const shared = {
    lineColor: '#343434',
    gridMinorColor: '#565656',
    sensorGeom: new THREE.SphereGeometry(0.033, 8, 8),
    sensorMat: new THREE.MeshBasicMaterial({ color: '#343434' }), // Fallback color
    wireMat: new THREE.LineBasicMaterial({ color: '#343434' }),
    furnitureMat: new THREE.MeshBasicMaterial({
        color: new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--furniture-color').trim() || '#8D6E63'),
    }),
    shadeMat: new THREE.MeshBasicMaterial({ color: '#1a1a1a', side: THREE.DoubleSide }), // Fallback color
    taskAreaMat: new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.2, side: THREE.DoubleSide }),
    surroundingAreaMat: new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.2, side: THREE.DoubleSide }),
    contextMat: new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.DoubleSide }),
    vegetationCanopyMat: new THREE.MeshBasicMaterial({ color: 0x4caf50, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
};

// --- HELPER FUNCTIONS ---

/**
 * Updates the color of the selection highlight material based on the current theme.
 */
export function updateHighlightColor() {
    if (highlightMaterial) {
        const newColor = getComputedStyle(document.documentElement).getPropertyValue('--highlight-color').trim() || '#3b82f6';
        highlightMaterial.color.set(newColor);
    }
}

/**
 * Updates the color of all furniture objects to match the current theme.
 */
export function updateFurnitureColor() {
    // Read the color directly from the CSS variables for the active theme.
    const newColor = getComputedStyle(document.documentElement).getPropertyValue('--furniture-color').trim() || '#8D6E63';

    // Since all furniture shares one material instance, we only need to update that single instance.
    shared.furnitureMat.color.set(newColor);
}

function applyClippingToMaterial(mat, clippingPlanes) {
    if (!mat) return;
    mat.clippingPlanes = clippingPlanes;
    mat.clipIntersection = true;
}

function disposeMeshLike(obj) {
    if (obj.geometry) obj.geometry.dispose?.();
    if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
        else obj.material.dispose?.();
    }
}

function clearGroup(group) {

    if (group === resizeHandlesObject) {
        // No specific cleanup needed yet, but good to have the case
    }
    if (group === wallSelectionGroup) {
        highlightedWalls = [];
    }
    if (group === furnitureObject) {
        // Any specific cleanup for furniture can go here
    }

    if (group === shadingObject) {
        importedShadingObjects.length = 0;
    }
    if (group === contextObject) {
        // No specific cleanup needed yet, but good to have the case
    }
    if (group === vegetationObject) {
        // No specific cleanup needed
    }
    group.traverse(child => {
        if (child.element && child.removeFromParent) {
            child.element.remove();
        }
        disposeMeshLike(child);
    });
    while (group.children.length) group.remove(group.children[0]);
}

function readParams() {
    const dom = getDom();
    const W = parseFloat(dom.width.value);
    const L = parseFloat(dom.length.value);
    const H = parseFloat(dom.height.value);
    const elevation = parseFloat(dom.elevation.value);
    const rotationY = THREE.MathUtils.degToRad(parseFloat(dom['room-orientation'].value));
    const surfaceThickness = parseFloat(dom['surface-thickness'].value);
    return { W, L, H, elevation, rotationY, wallThickness: surfaceThickness, floorThickness: surfaceThickness, ceilingThickness: surfaceThickness };
}

// --- MAIN UPDATE FUNCTION ---

/**
 * The main function to update all geometric aspects of the scene.
 * @param {string|null} changedId The ID of the input element that triggered the update.
 */
export async function updateScene(changedId = null) {
    if (!renderer) return;
    const dom = getDom();

    validateInputs(changedId);
    const { W, L, H, rotationY, elevation } = readParams();

    // Apply room rotation and elevation to all relevant geometry groups
    const groupsToTransform = [roomObject, shadingObject, wallSelectionGroup, furnitureObject, resizeHandlesObject, vegetationObject];
    groupsToTransform.forEach(group => {
        group.rotation.y = rotationY;
        group.position.y = elevation;
    });

    const showGround = dom['ground-plane-toggle']?.checked ?? true;
    groundObject.visible = showGround;
    northArrowObject.visible = true; // North Arrow is now always visible

    // Update clipping planes
    const activeClippingPlanes = [];
    if (dom['h-section-toggle']?.checked) {
        horizontalClipPlane.constant = parseFloat(dom['h-section-dist'].value);
        activeClippingPlanes.push(horizontalClipPlane);
    }
    if (dom['v-section-toggle']?.checked) {
        const vDist = parseFloat(dom['v-section-dist'].value);
        verticalClipPlane.constant = vDist - W / 2;
        activeClippingPlanes.push(verticalClipPlane);
    }
    renderer.clippingPlanes = activeClippingPlanes;

    // If the room orientation changed, re-sync the viewpoint camera from the UI sliders.
    if (changedId === 'room-orientation') {
        updateViewpointFromSliders();
    }

    // Clear aperture registry before recreating geometry
    clearApertureRegistry();

    // Recreate all geometry based on the new parameters
    createRoomGeometry();
    createShadingDevices();

    createGroundPlane();
    createNorthArrow();
    createResizeHandles();


    // Create or update the world axes helper
    let axesHelper = axesObject.getObjectByName('axesHelper');
    if (!axesHelper) {
        axesHelper = new THREE.AxesHelper(1); // Create with a unit size of 1
        axesHelper.name = 'axesHelper';
        axesObject.add(axesHelper);
    }
    const axesSize = dom['world-axes-size'] ? parseFloat(dom['world-axes-size'].value) : 1.5;
    axesObject.scale.set(axesSize, axesSize, axesSize); // Scale the parent group
    axesObject.position.set(0, 0.01, 0); // Lift slightly off the ground plane
    axesObject.visible = dom['world-axes-toggle']?.checked ?? true;

    // After rebuilding geometry, re-apply highlights for selected walls
    const { aperturePanel } = await import('./ui.js');
    if (aperturePanel) {
        const { walls } = aperturePanel.getSelectionState();
        walls.forEach(wallId => {
            const wallContainer = wallSelectionGroup.children[0];
            if (wallContainer) {
                const wallToHighlight = wallContainer.children.find(
                    group => group.userData.canonicalId === wallId
                );
                if (wallToHighlight) {
                    const wallMesh = wallToHighlight.children.find(c => c.isMesh && c.userData.isSelectableWall);
                    if (wallMesh) {
                        highlightWall(wallMesh, false); // false = don't clear previous highlights
                    }
                }
            }
        });
    }
}

// --- GEOMETRY CREATION FUNCTIONS ---

/**
 * Creates a mesh with a wireframe outline.
 * @param {THREE.BufferGeometry} geometry The geometry for the mesh.
 * @param {THREE.Group} group The group to add the mesh and wireframe to.
 * @param {THREE.Material} material The material for the mesh's surfaces.
 * @param {string} [surfaceType] - Optional surface type for ray tracing classification.
 */
function createSchematicObject(geometry, group, material, surfaceType) {
    const mesh = new THREE.Mesh(geometry, material);
    if (surfaceType) {
        mesh.userData.surfaceType = surfaceType;
    }
    applyClippingToMaterial(mesh.material, renderer.clippingPlanes);

    const edges = new THREE.EdgesGeometry(geometry);
    let wireMat = shared.wireMat;
    if (renderer.clippingPlanes.length > 0) {
        wireMat = wireMat.clone();
        applyClippingToMaterial(wireMat, renderer.clippingPlanes);
    }
    const wireframe = new THREE.LineSegments(edges, wireMat);
    group.add(mesh, wireframe);
    return mesh;
}

/**
 * Creates the ground plane, which can be a flat grid or a 3D topography.
 */
function createGroundPlane() {
    clearGroup(groundObject);
    const dom = getDom();
    const { W, L } = readParams();

    // Read grid size and divisions from the UI
    const gridSize = dom['ground-grid-size'] ? parseFloat(dom['ground-grid-size'].value) : 50;
    const gridDivisions = dom['ground-grid-divisions'] ? parseInt(dom['ground-grid-divisions'].value, 10) : 50;

    const isTopoMode = dom['context-mode-topo']?.classList.contains('active');
    const topoFile = project.simulationFiles['topo-heightmap-file'];

    if (isTopoMode && topoFile && topoFile.content instanceof Blob) {
        // --- Create Topography from Heightmap ---
        const imageUrl = URL.createObjectURL(topoFile.content);
        const planeSize = parseFloat(dom['topo-plane-size'].value);
        const verticalScale = parseFloat(dom['topo-vertical-scale'].value);

        const img = new Image();
        img.onerror = () => {
            import('./ui.js').then(({ showAlert }) => {
                showAlert(`Failed to load the specified heightmap image: ${topoFile.name}. Please check if the file is a valid image.`, 'Topography Error');
            });
            URL.revokeObjectURL(imageUrl); // Clean up
        };
        img.onload = () => {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const ctx = tempCanvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            const data = imageData.data;

            const geometry = new THREE.PlaneGeometry(planeSize, planeSize, img.width - 1, img.height - 1);
            const vertices = geometry.attributes.position;

            for (let i = 0; i < vertices.count; i++) {
                const u = (vertices.getX(i) / planeSize + 0.5);
                const v = 1 - (vertices.getY(i) / planeSize + 0.5);
                const px = Math.floor(u * (img.width - 1));
                const py = Math.floor(v * (img.height - 1));
                const pixelIndex = (py * img.width + px) * 4;
                const height = data[pixelIndex] / 255.0; // Use red channel as height
                vertices.setZ(i, height * verticalScale);
            }
            vertices.needsUpdate = true;
            geometry.computeVertexNormals();

            const groundMaterial = new THREE.MeshStandardMaterial({
                color: 0x5a687a,
                wireframe: true,
                side: THREE.DoubleSide
            });
            applyClippingToMaterial(groundMaterial, renderer.clippingPlanes);

            const mesh = new THREE.Mesh(geometry, groundMaterial);
            mesh.rotation.x = -Math.PI / 2; // Orient plane correctly
            mesh.userData.isGround = true; // Flag for Radiance export
            groundObject.add(mesh);
            URL.revokeObjectURL(imageUrl); // Clean up
        };
        img.onerror = () => {
            console.error("Failed to load heightmap image.");
            URL.revokeObjectURL(imageUrl);
        };
        img.src = imageUrl;
    } else {
        // --- Create Default Flat Grid ---
        // Use the values from the UI sliders
        const size = gridSize;
        const gridHelper = new THREE.GridHelper(size, gridDivisions, shared.lineColor, shared.gridMinorColor);
        gridHelper.position.set(0, -0.001, 0);

        const mat = new THREE.MeshBasicMaterial({
            color: 0xdddddd,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide
        });
        applyClippingToMaterial(mat, renderer.clippingPlanes);
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -0.002;
        plane.userData.isGround = true; // Flag for Radiance export
        groundObject.add(gridHelper, plane);
    }
}

/**
 * Creates the entire room geometry, including walls, floor, ceiling, windows, and frames.
 * Walls are now individual, selectable meshes.
 */
function createRoomGeometry() {
    // If an imported model is active, do not generate parametric geometry.
    if (currentImportedModel) {
        clearGroup(roomObject);
        clearGroup(wallSelectionGroup);
        clearApertureRegistry(); // Clear aperture tracking
        return;
    }
    clearGroup(roomObject);
    clearGroup(wallSelectionGroup);
    clearApertureRegistry(); // Clear aperture tracking when rebuilding geometry

    const { W, L, H, wallThickness, floorThickness, ceilingThickness } = readParams();
    const roomContainer = new THREE.Group();
    roomContainer.position.set(-W / 2, 0, -L / 2);

    _createFloor(roomContainer, { W, L, floorThickness, wallThickness });
    _createCeiling(roomContainer, { W, L, H, ceilingThickness, wallThickness });
    _createWalls({ W, L, H, wallThickness });

    roomObject.add(roomContainer);
}

/**
 * Creates the floor geometry and adds it to the room container.
 * @param {THREE.Group} roomContainer - The parent group for the floor.
 * @param {object} dims - Dimensions object { W, L, floorThickness, wallThickness }.
 * @private
 */
function _createFloor(roomContainer, { W, L, floorThickness, wallThickness }) {
    const isTransparent = getDom()['transparent-toggle'].checked;
    const surfaceOpacity = isTransparent ? parseFloat(getDom()['surface-opacity'].value) : 1.0;
    const materialProperties = { side: THREE.DoubleSide, clippingPlanes: renderer.clippingPlanes, clipIntersection: true, transparent: isTransparent, opacity: surfaceOpacity };
    const floorMaterial = new THREE.MeshBasicMaterial({ ...materialProperties, color: new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--floor-color').trim()) });

    const floorGeom = new THREE.BoxGeometry(W + 2 * wallThickness, L + 2 * wallThickness, floorThickness);
    const floorGroup = new THREE.Group();
    floorGroup.rotation.x = -Math.PI / 2;
    floorGroup.position.set(W / 2, -floorThickness / 2 - 0.001, L / 2); // Lower slightly to avoid Z-fighting
    createSchematicObject(floorGeom, floorGroup, floorMaterial, SURFACE_TYPES.INTERIOR_FLOOR);
    roomContainer.add(floorGroup);
}

/**
 * Creates the ceiling geometry and adds it to the room container.
 * @param {THREE.Group} roomContainer - The parent group for the ceiling.
 * @param {object} dims - Dimensions object { W, L, H, ceilingThickness, wallThickness }.
 * @private
 */
function _createCeiling(roomContainer, { W, L, H, ceilingThickness, wallThickness }) {
    const isTransparent = getDom()['transparent-toggle'].checked;
    const surfaceOpacity = isTransparent ? parseFloat(getDom()['surface-opacity'].value) : 1.0;
    const materialProperties = { side: THREE.DoubleSide, clippingPlanes: renderer.clippingPlanes, clipIntersection: true, transparent: isTransparent, opacity: surfaceOpacity };
    const ceilingMaterial = new THREE.MeshBasicMaterial({ ...materialProperties, color: new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--ceiling-color').trim()) });

    const ceilingGeom = new THREE.BoxGeometry(W + 2 * wallThickness, L + 2 * wallThickness, ceilingThickness);
    const ceilingGroup = new THREE.Group();
    ceilingGroup.rotation.x = -Math.PI / 2;
    ceilingGroup.position.set(W / 2, H + ceilingThickness / 2 + 0.001, L / 2); // Raise slightly to avoid Z-fighting
    createSchematicObject(ceilingGeom, ceilingGroup, ceilingMaterial, SURFACE_TYPES.INTERIOR_CEILING);
    roomContainer.add(ceilingGroup);
}

/**
 * Creates all four walls and adds them to the selectable wall group.
 * @param {object} dims - Dimensions object { W, L, H, wallThickness }.
 * @private
 */
function _createWalls({ W, L, H, wallThickness }) {
    const wallContainer = new THREE.Group();
    wallContainer.position.set(-W / 2, 0, -L / 2);

    const allWindows = getAllWindowParams();
    const walls = {
        n: { s: [W, H], p: [W / 2, H / 2, 0], r: [0, Math.PI, 0] },
        s: { s: [W, H], p: [W / 2, H / 2, L], r: [0, 0, 0] },
        w: { s: [L, H], p: [0, H / 2, L / 2], r: [0, -Math.PI / 2, 0] },
        e: { s: [L, H], p: [W, H / 2, L / 2], r: [0, -Math.PI / 2, 0] },
    };

    for (const [key, props] of Object.entries(walls)) {
        const wallSegment = _createWallSegment(key, props, allWindows[key.toUpperCase()], { H, wallThickness });
        wallContainer.add(wallSegment);
    }
    wallSelectionGroup.add(wallContainer);
}

/**
 * Creates a single wall segment, including windows and frames.
 * @param {string} key - The wall identifier ('n', 's', 'e', 'w').
 * @param {object} props - The wall's properties (size, position, rotation).
 * @param {object} winParams - The window parameters for this wall.
 * @param {object} roomDims - Room dimensions { H, wallThickness }.
 * @returns {THREE.Group} The group containing the wall mesh and its components.
 * @private
 */
function _createWallSegment(key, props, winParams, { H, wallThickness }) {
    const dom = getDom();
    const isTransparent = dom['transparent-toggle'].checked;
    const surfaceOpacity = isTransparent ? parseFloat(dom['surface-opacity'].value) : 1.0;
    const materialProperties = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide, clippingPlanes: renderer.clippingPlanes, clipIntersection: true, transparent: isTransparent, opacity: surfaceOpacity };
    const wallMaterial = new THREE.MeshBasicMaterial({ ...materialProperties, color: new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--wall-color').trim()) });
    const windowMaterial = new THREE.MeshBasicMaterial({ color: 0xb3ecff, side: THREE.DoubleSide, transparent: true, opacity: dom['glazing-trans'] ? parseFloat(dom['glazing-trans'].value) : 0.6, clippingPlanes: renderer.clippingPlanes, clipIntersection: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 1 });
    const frameMaterial = new THREE.MeshBasicMaterial({ ...materialProperties, color: new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--frame-color').trim()) });

    const wallMeshGroup = new THREE.Group();
    wallMeshGroup.position.set(...props.p);
    wallMeshGroup.rotation.set(...props.r);
    wallMeshGroup.userData = { canonicalId: key };

    const isEW = key === 'e' || key === 'w';
    // Fix: Only the East wall needs the negative Z translation/inversion logic. 
    // West wall aligns correctly with standard positive extrusion in this coordinate system.
    const isEast = key === 'e';

    let wallW = props.s[0];
    const wallH = props.s[1];
    if (isEW) wallW += (2 * wallThickness);

    if (winParams && winParams.ww > 0 && winParams.wh > 0 && winParams.winCount > 0) {
        const { ww, wh, sh, winCount, mode, winDepthPos } = winParams;
        const wallShape = new THREE.Shape();
        wallShape.moveTo(-wallW / 2, -wallH / 2);
        wallShape.lineTo(wallW / 2, -wallH / 2);
        wallShape.lineTo(wallW / 2, wallH / 2);
        wallShape.lineTo(-wallW / 2, wallH / 2);
        wallShape.closePath();

        const spacing = mode === 'wwr' ? 0.1 : ww / 2;
        const groupWidth = winCount * ww + Math.max(0, winCount - 1) * spacing;
        const startX = -groupWidth / 2;

        // Safely check for frame toggle and values
        const addFrame = dom['frame-toggle']?.checked ?? false;
        const ft = addFrame ? (parseFloat(dom['frame-thick']?.value) || 0) : 0;

        const outsideProj = addFrame ? (parseFloat(dom['frame-outside-proj']?.value) || 0) : 0;
        const insideProj = addFrame ? (parseFloat(dom['frame-inside-proj']?.value) || 0) : 0;
        // Frame Depth covers wall thickness + projections
        const frameDepth = addFrame ? (wallThickness + outsideProj + insideProj) : 0;

        // Center Z offset assuming Wall is from -thickness/2 to +thickness/2 and Z+ is Out
        const frameCenterZ = (outsideProj - insideProj) / 2;

        for (let i = 0; i < winCount; i++) {
            const winCenterX = startX + ww / 2 + i * (ww + spacing);
            const winCenterY = sh + wh / 2 - H / 2;
            const holePath = new THREE.Path();
            holePath.moveTo(winCenterX - ww / 2, winCenterY - wh / 2);
            holePath.lineTo(winCenterX + ww / 2, winCenterY - wh / 2);
            holePath.lineTo(winCenterX + ww / 2, winCenterY + wh / 2);
            holePath.lineTo(winCenterX - ww / 2, winCenterY + wh / 2);
            holePath.closePath();
            wallShape.holes.push(holePath);

            // Generate unique aperture ID
            const wallIdUpper = key.toUpperCase(); // N, S, E, W
            const apertureId = `${wallIdUpper}_Win_${i + 1}`;
            const apertureName = `${wallIdUpper} Wall Window ${i + 1}`;

            // Fix: Use isEast to determine depth inversion
            const effectiveWinDepthPos = (isEast) ? -winDepthPos : winDepthPos;
            const glassWidth = Math.max(0, ww - 2 * ft);
            const glassHeight = Math.max(0, wh - 2 * ft);

            if (glassWidth > 0 && glassHeight > 0) {
                const glass = new THREE.Mesh(new THREE.PlaneGeometry(glassWidth, glassHeight), windowMaterial);
                glass.userData.surfaceType = SURFACE_TYPES.GLAZING;
                glass.userData.apertureId = apertureId; // Store ID on the mesh
                applyClippingToMaterial(glass.material, renderer.clippingPlanes);
                glass.position.set(winCenterX, winCenterY, effectiveWinDepthPos);
                wallMeshGroup.add(glass);

                // Register aperture metadata
                registerAperture({
                    id: apertureId,
                    name: apertureName,
                    wallId: key,
                    wallIdUpper: wallIdUpper,
                    index: i,
                    position: {
                        x: winCenterX,
                        y: winCenterY,
                        z: effectiveWinDepthPos
                    },
                    dimensions: {
                        width: ww,
                        height: wh,
                        glassWidth: glassWidth,
                        glassHeight: glassHeight
                    },
                    sillHeight: sh,
                    mode: mode,
                    depth: winDepthPos,
                    frame: addFrame ? {
                        thickness: ft,
                        outsideProjection: outsideProj,
                        insideProjection: insideProj
                    } : null
                });
            }



            // Frame Depth Logic with new 'Thickness' parameter
            // These need to be outside the frame block so dividers can use them
            const coreThickness = dom['frame-depth'] ? (parseFloat(dom['frame-depth'].value) || wallThickness) : wallThickness;
            const frameDepthGeom = coreThickness + outsideProj + insideProj;

            // Calculate frame start Z position (needed for both frames and dividers)
            const wallCenterZ = isEast ? -wallThickness / 2 : wallThickness / 2;
            let frameStartZ = wallCenterZ - (coreThickness / 2) - insideProj;


            if (addFrame && ft > 0) {
                const frameShape = new THREE.Shape();
                frameShape.moveTo(winCenterX - ww / 2, winCenterY - wh / 2);
                frameShape.lineTo(winCenterX + ww / 2, winCenterY - wh / 2);
                frameShape.lineTo(winCenterX + ww / 2, winCenterY + wh / 2);
                frameShape.lineTo(winCenterX - ww / 2, winCenterY + wh / 2);
                frameShape.closePath();
                const frameHole = new THREE.Path();
                frameHole.moveTo(winCenterX - glassWidth / 2, winCenterY - glassHeight / 2);
                frameHole.lineTo(winCenterX + glassWidth / 2, winCenterY - glassHeight / 2);
                frameHole.lineTo(winCenterX + glassWidth / 2, winCenterY + glassHeight / 2);
                frameHole.lineTo(winCenterX - glassWidth / 2, winCenterY + glassHeight / 2);
                frameHole.closePath();
                frameShape.holes.push(frameHole);

                const frameExtrudeSettings = { steps: 1, depth: frameDepthGeom, bevelEnabled: false };
                const frameGeometry = new THREE.ExtrudeGeometry(frameShape, frameExtrudeSettings);

                // Frame Placement Logic:
                // Wall Local Z spans from 0 to wallThickness (in standard N/S/W logic).
                // Wall Center = wallThickness / 2.
                // Core Start (Z) = Wall Center - coreThickness / 2.
                // Core End (Z) = Wall Center + coreThickness / 2.

                // We want the geometry to start at 'Core Start' MINUS 'Inside Projection'
                // (Since Extrusion goes Z-Positive)
                // So Start Z = (wallThickness / 2) - (coreThickness / 2) - insideProj.

                let frameStartZ = (wallThickness / 2) - (coreThickness / 2) - insideProj;

                // For East Wall (E):
                // Wall segment logic translates geometry by -wallThickness (if isEast).
                // However, the Wall Shape itself is 2D. The Extrusion creates depth.
                // _createWallSegment logic for E: 
                // "const wallGeometry = ...; if (isEast) wallGeometry.translate(0, 0, -wallThickness);"
                // This implies the wall mesh *local origin* is at Z=wallThickness relative to the geometry start.
                // Actually, let's look at the wall translation logic again.
                // Standard Wall (N,S,W): Extrudes 0 -> wallThickness. Mesh is at (0,0,0).
                // East Wall: Extrudes 0 -> wallThickness. BUT Geometry Translated by -wallThickness.
                // So Vertices are [-wallThickness, 0].
                // So for East Wall, the "Wall" spans [-wallThickness, 0].
                // Wall Center = -wallThickness / 2.

                // But we are adding the frame to 'wallMeshGroup'.
                // 'wallMeshGroup' for E wall is rotated -90 deg Y.
                // Coordinate system for E wall group:
                // X+ is North (along wall width).
                // Y+ is Up.
                // Z+ is East (Outward).

                // Wait, let's check Rotation R: [0, -Math.PI/2, 0].
                // Global X is East. Use Right-Hand Rule.
                // Local X points -> Global Z (South).
                // Local Z points -> Global X (East).  <-- Correct, Z is Outward.

                // In N/S/W, Z is Outward (or Inward depending on orientation, but consistently wall thickness is positive).
                // Let's re-verify Standard Wall (N). Rot [0, PI, 0].
                // Global Z is South.
                // Local Z points -> Global -Z (North). Outward.
                // Wall Geometry: Box(0..thickness). Z goes 0 to positive.
                // So geometry is 0 (Interior) to Thickness (Exterior).

                // Back to East Wall.
                // Rot -PI/2.
                // Local Z points East (Outward).
                // IF we translated geometry by -wallThickness, it spans [-Thickness, 0].
                // This means 0 is Exterior, -Thickness is Interior.
                // This is INVERTED compared to others.

                // Let's normalize the frame calculation.
                // We want Frame Center at Wall Center.
                // IF Standard (0..T): Center = T/2.
                // IF East (-T..0): Center = -T/2.

                // Calculated frameStartZ (standard) = T/2 - Core/2 - InsideProj.

                // Apply East Logic:
                // If East, we need to shift everything by -wallThickness to match the wall geometry shift?
                // OR calculate directly.
                // Center = -wallThickness/2.
                // Start = Center - Core/2 - InsideProj? 
                // Wait, Extrusion is always Positive Z.
                // If we want to span from [Center - Core/2] to [Center + Core/2],
                // Start needs to be there.

                // But there is a confusion in existing code about East wall translation.
                // "const frameTransZ = isEast ? (-wallThickness - outsideProj) : -insideProj;"
                // Existing Standard: Start = -insideProj. (Implies Core=WallThickness).
                //   Length = WallThickness + In + Out.
                //   Span: [-Inside, WallThickness + Outside].
                //   Center = (WallThickness + Outside - Inside) / 2.
                //   Shift from WallCenter(T/2) = (Outside - Inside)/2.

                // Existing East:
                //   Start = -wallThickness - outsideProj.
                //   End = Start + Length = -wallThickness - outsideProj + (WallThickness + In + Out).
                //       = -wallThickness - outsideProj + WallThickness + In + Out
                //       = In - outsideProj? No.
                //       = -wallThickness + WallThickness + In + Out - outsideProj
                //       = In.
                //   Span: [-T - Out, In].
                //   This looks like it goes from Exterior (negative) to Interior (positive)?
                //   Wait, for E wall, Z is Outward.
                //   If Wall is [-T, 0]. 0 is Out. -T is In.
                //   So -T-Out is MORE IN. In is OUT.
                //   This seems reversed.
                //   Let's check 'isEast' logic in 'createWallSegment'.
                //   "if (isEast) wallGeometry.translate(0, 0, -wallThickness);"
                //   "const z_translation = isEast ? -wallThickness / 2 : wallThickness / 2;" (BoxGeom case)

                // Let's assume standard behavior is Z+ = Outward.
                // For East: Wall is [-T, 0]. 0=Out, -T=In.
                // Core Center = -T/2.
                // We want Core to span [-T/2 - Core/2, -T/2 + Core/2].
                // Plus Projections.
                // Inside Projection usually extends INWARDS (away from Out).
                // So towards Negative Z?
                // Wait.
                // N-Wall (0..T). 0=In, T=Out.
                // InsideProj extends to Negative Z (e.g. -0.1). Correct.
                // OutsideProj extends to Positive Z (e.g. T+0.1). Correct.

                // E-Wall (-T..0). -T=In, 0=Out.
                // InsideProj should extend INWARDS (more Negative).
                // So End = -T - InsideProj.
                // Start = 0 + OutsideProj.
                // So Span should be [-T - Inside, +Outside].
                // But Extrusion is always +Z.
                // So Start MUST be the most negative value.
                // Start = -T - InsideProj.
                // Length = T + In + Out.
                // End = Start + Length = -T - In + T + In + Out = Out. Correct.

                // So for E-Wall: Start = -wallThickness - InsideProj?
                // Let's check legacy: "isEast ? (-wallThickness - outsideProj)"
                // This implies legacy thought Outside was Negative?
                // Let's check: "const isEast = key === 'e';"
                // "const z_translation = isEast ? -wallThickness / 2 : ... " -> Center at -T/2.
                // This implies Wall is indeed [-T, 0].
                // If Wall is [-T, 0] and 0 is OUT (Global East), then -T is IN.
                // So Inside Proj should go to -T - Inside.
                // Outside Proj should go to 0 + Outside.
                // Legacy Code: "isEast ? (-wallThickness - outsideProj)"
                // This starts at -T - Out.
                // And goes to (-T - Out) + (T + In + Out) = In.
                // So it spans [-T - Out, In].
                // So legacy frame went FURTHER IN (-T - Out) and stuck out INTO THE ROOM (In)?
                // If 0 is Out.
                // Wait.

                // Re-evaluating Coordinate System for E Wall.
                // Rot = [0, -PI/2, 0].
                // Local X = South.
                // Local Z = East. (Global).
                // Wall Pos = [W, H/2, L/2]. (Center of East Edge).
                // If we don't translate: Box is centered at 0. [-T/2, T/2].
                // Global Z is East. So T/2 is MORE EAST (Out). -T/2 is LESS EAST (In).
                // So [-T/2, T/2] is centered on the wall line.
                // BUT 'createRoomGeometry' walls are offset?
                // Walls are created at:
                // N: W/2, H/2, 0. Rot 180.
                // S: W/2, H/2, L. Rot 0.
                // E: W, H/2, L/2. Rot -90.
                // W: 0, H/2, L/2. Rot -90.

                // If E Wall geometry is translated by -wallThickness...
                // Only if extruded?
                // "if (isEast) wallGeometry.translate(0, 0, -wallThickness);"
                // This suggests the "Base Plane" for E wall is the INNER face? Or Outer?
                // N/S/W Walls seem to originate from Interior and extrude Out?
                // (0..T). 0=In.
                // E Wall seems to originate from Exterior and extrude In?
                // Or rather, E Wall plane is at X=W (Exterior).
                // So we want wall to go IN from X=W.
                // Global X goes 0..W.
                // So Wall should be [W-T, W].
                // Local Z = East.
                // Origin at X=W.
                // Wall should be [-T, 0] in Local Z.
                // 0 is X=W (Exterior). -T is X=W-T (Interior).
                // CORRECT.
                // So for E Wall: 0 is OUT. -T is IN.
                // Inside Projection should go MORE NEGATIVE (Internal). -> From -T towards -infinity.
                // Outside Projection should go MORE POSITIVE (External). -> From 0 towards +infinity.
                // So Span: [ -T - Inside, 0 + Outside ].
                // Total Depth = T + Inside + Outside.
                // Start (Most Negative) = -wallThickness - InsideProj.

                // Legacy code used: "isEast ? (-wallThickness - outsideProj)"
                // This implies legacy thought Outside was Negative.
                // Why?
                // Maybe "Inside" means "Inside the Room"?
                // If I am at -T (Interior Face). Inside the room is -T - something.
                // Legacy: Start at -T - OUTSIDE.
                // This implies legacy inverted In/Out for East wall?
                // Or maybe I am misinterpreting "outsideProj".

                // Let's stick to the NEW Logic which is explicit.
                // We trust "Expanding Equally". Center = Wall Center.
                // Wall Center (E) = -wallThickness / 2.
                // Wall Center (Others) = wallThickness / 2.

                // New Logic:
                // Core Range (Centered): [Center - Core/2, Center + Core/2].
                // Add Projections to this Centered Core.
                // Start (Most Negative Z in local coords) needs to handle In/Out correctly.

                // Standard (0=In, T=Out):
                //   Most Negative is "Inside" direction.
                //   Wait, 0 is In. Negative is MORE In.
                //   So Inside Projection extends to Negative Z.
                //   Direction "In" = -Z.
                //   Direction "Out" = +Z.
                //   Core Start = T/2 - Core/2.
                //   With Projections:
                //   Z_Start = CoreStart - InsideProj  (Since Inside is -Z).
                //   Z_End = CoreEnd + OutsideProj   (Since Outside is +Z).
                //   Depth = Z_End - Z_Start = Core + In + Out.
                //   Translation = Z_Start.
                //   This matches my `frameStartZ` logic above.

                // East (0=Out, -T=In):
                //   Most Negative is "Inside" direction?
                //   0 is Out. -T is In.
                //   Direction "In" = -Z. (Same!)
                //   Direction "Out" = +Z. (Same!)
                //   Because -T is less than 0.
                //   So -Z moves towards Interior. +Z moves towards Exterior.
                //   This is CONSISTENT.

                //   Center = -wallThickness / 2.
                //   Core Start = Center - Core/2.
                //   Z_Start = CoreStart - InsideProj.
                //   Translation = Z_Start.

                //   So the formula is IDENTICAL just with a different Center.
                //   Standard Center = wallThickness/2.
                //   East Center = -wallThickness/2.

                frameGeometry.translate(0, 0, frameStartZ);

                const frameMesh = new THREE.Mesh(frameGeometry, frameMaterial);
                frameMesh.userData.surfaceType = SURFACE_TYPES.FRAME;
                applyClippingToMaterial(frameMesh.material, renderer.clippingPlanes);
                wallMeshGroup.add(frameMesh);
            }

            // --- Dividers Visualization ---
            const dividerType = dom['frame-divider-type']?.value || 'None';
            if (dividerType !== 'None') {
                const divHoriz = parseInt(dom['frame-divider-horiz']?.value) || 0;
                const divVert = parseInt(dom['frame-divider-vert']?.value) || 0;
                const divWidth = parseFloat(dom['frame-divider-width']?.value) || 0.02;

                // Divider Inputs
                const divOutside = parseFloat(dom['frame-divider-outside-proj']?.value) || 0;
                const divInside = parseFloat(dom['frame-divider-inside-proj']?.value) || 0;

                // Use Core Thickness for Dividers too if custom? 
                // Usually Dividers are thinner.
                // Legacy: "divDepth = hasDivProj ? (wallThickness + divOutside + divInside) : frameDepth"
                // New: Base depth on frameDepthGeom?
                // If dividers have their own projections, use those relative to Wall?
                // OR relative to Frame?
                // "thickness" slider was for Frame.
                // Dividers might default to Frame Thickness if not projected?
                // The prompt didn't specify Divider changes, but consistency is good.
                // Let's stick to legacy behavior heavily but adapted for centered frame.
                // If hasDivProj, it defines total depth.
                // If NOT hasDivProj, it matches the Frame Depth.

                const hasDivProj = (divOutside + divInside > 0);

                // Note: frameDepthGeom includes projections.
                // If we want dividers to match frame:
                const divDepth = hasDivProj ? (wallThickness + divOutside + divInside) : frameDepthGeom;

                let divZPos;

                if (hasDivProj) {
                    // If explicit projections, assumed relative to Wall Core??
                    // Or relative to Wall Faces?
                    // Legacy logic was complex.
                    // New Logic: Center dividers on Wall Center.
                    // Span = [-Depth/2, +Depth/2] relative to Center?
                    // Start = Center - Depth/2.
                    // But we have Inside/Outside proj.
                    // Let's assume Dividers are Centered on WallCenter, extended by Projections?
                    // Actually, let's just center them on the Frame Center.
                    // Frame Center = wallCenterZ + (outsideProj - insideProj)/2.
                    // Divider Center = Frame Center?

                    // If hasDivProj (custom projections):
                    // Center = wallCenterZ + (divOutside - divInside)/2.
                    divZPos = wallCenterZ + (divOutside - divInside) / 2;
                } else {
                    // Match Frame Center
                    // Frame Geometry spans [Start, Start + Depth].
                    // Center = Start + Depth/2.
                    divZPos = frameStartZ + frameDepthGeom / 2;
                }

                if (divWidth > 0) {
                    // Horizontal Dividers
                    if (divHoriz > 0) {
                        const hSpacing = wh / (divHoriz + 1);
                        const hGeom = new THREE.BoxGeometry(glassWidth, divWidth, divDepth);
                        for (let j = 1; j <= divHoriz; j++) {
                            const hDiv = new THREE.Mesh(hGeom, frameMaterial);
                            const yPos = winCenterY - wh / 2 + j * hSpacing;
                            hDiv.position.set(winCenterX, yPos, divZPos);

                            hDiv.userData.surfaceType = SURFACE_TYPES.FRAME; // Treat as frame/shading
                            applyClippingToMaterial(hDiv.material, renderer.clippingPlanes);
                            wallMeshGroup.add(hDiv);
                        }
                    }

                    // Vertical Dividers
                    if (divVert > 0) {
                        const vSpacing = ww / (divVert + 1);
                        const vGeom = new THREE.BoxGeometry(divWidth, glassHeight, divDepth);
                        for (let k = 1; k <= divVert; k++) {
                            const vDiv = new THREE.Mesh(vGeom, frameMaterial);
                            const xPos = winCenterX - ww / 2 + k * vSpacing;
                            vDiv.position.set(xPos, winCenterY, divZPos);

                            vDiv.userData.surfaceType = SURFACE_TYPES.FRAME;
                            applyClippingToMaterial(vDiv.material, renderer.clippingPlanes);
                            wallMeshGroup.add(vDiv);
                        }
                    }
                }
            }
        }

        const extrudeSettings = { steps: 1, depth: wallThickness, bevelEnabled: false };
        const wallGeometry = new THREE.ExtrudeGeometry(wallShape, extrudeSettings);
        // Fix: Only translate geometry for East wall
        if (isEast) wallGeometry.translate(0, 0, -wallThickness);

        const wallMeshWithHoles = createSchematicObject(wallGeometry, wallMeshGroup, wallMaterial, SURFACE_TYPES.INTERIOR_WALL);
        wallMeshWithHoles.userData.isSelectableWall = true;
    } else {
        const wallGeometry = new THREE.BoxGeometry(wallW, wallH, wallThickness);
        // Fix: Determine Z translation based on isEast
        const z_translation = isEast ? -wallThickness / 2 : wallThickness / 2;
        wallGeometry.translate(0, 0, z_translation);
        const wallMesh = createSchematicObject(wallGeometry, wallMeshGroup, wallMaterial, SURFACE_TYPES.INTERIOR_WALL);
        wallMesh.userData.isSelectableWall = true;
    }
    return wallMeshGroup;
}

/**
 * Creates the sensor grid geometry for all selected surfaces.
 */


/**
 * Creates a 3D North arrow indicator.
 */
function createNorthArrow() {
    clearGroup(northArrowObject);
    const { W, L } = readParams();
    const origin = new THREE.Vector3((W / 2) + Math.max(W / 2, L / 2) + 1.5, 0, 0);
    const arrowColor = getComputedStyle(document.documentElement).getPropertyValue('--north-arrow-color').trim();
    const arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), origin, 1, arrowColor, 0.4, 0.2);
    northArrowObject.add(arrowHelper);

    const nDiv = document.createElement('div');
    nDiv.textContent = 'N';
    nDiv.style.color = arrowColor;
    nDiv.style.fontWeight = 'bold';
    const nLabel = new CSS2DObject(nDiv);
    nLabel.position.copy(origin).add(new THREE.Vector3(0, 0, -1.2));
    northArrowObject.add(nLabel);
}

/**
 * Returns the outward normal vector for a given wall orientation in ROOM-LOCAL coordinates
 * (before the global room rotation is applied).
 *
 * Conventions (room-local, origin at room center, Z forward):
 * - 'N' (north wall): outward = (0, 0, -1)
 * - 'S' (south wall): outward = (0, 0, 1)
 * - 'W' (west wall):  outward = (-1, 0, 0)
 * - 'E' (east wall):  outward = (1, 0, 0)
 */
function getWallOutwardNormal(orientation) {
    switch (orientation) {
        case 'N': return new THREE.Vector3(0, 0, -1);
        case 'S': return new THREE.Vector3(0, 0, 1);
        case 'W': return new THREE.Vector3(-1, 0, 0);
        case 'E': return new THREE.Vector3(1, 0, 0);
        default: return new THREE.Vector3(0, 0, 0);
    }
}

/**
 * Creates all shading devices based on UI settings.
 * Uses explicit outward normals for consistent external/internal placement across orientations.
 */
export function createShadingDevices() {
    clearGroup(shadingObject);
    const allWindows = getAllWindowParams();
    const allShading = getAllShadingParams();

    // Create a container that matches the room origin logic
    const { W, L, H } = readParams();
    const shadingContainer = new THREE.Group();
    // Match the room container position from createRoomGeometry
    shadingContainer.position.set(-W / 2, 0, -L / 2);

    // --- Wall Helper Groups ---
    // These groups mirror the exact position and rotation of the walls in _createWalls.
    // This allows us to place shading devices using the LOCAL coordinates (aperture.position).
    const wallGroups = {};
    const wallDefinitions = {
        N: { p: [W / 2, H / 2, 0], r: [0, Math.PI, 0] },
        S: { p: [W / 2, H / 2, L], r: [0, 0, 0] },
        W: { p: [0, H / 2, L / 2], r: [0, -Math.PI / 2, 0] },
        E: { p: [W, H / 2, L / 2], r: [0, -Math.PI / 2, 0] }
    };

    for (const [key, def] of Object.entries(wallDefinitions)) {
        const group = new THREE.Group();
        group.position.set(...def.p);
        group.rotation.set(...def.r);
        group.name = `WallGroup_${key}`;
        wallGroups[key] = group;
        shadingContainer.add(group);
    }

    const shadeColor = getComputedStyle(document.documentElement).getPropertyValue('--shading-color').trim();

    // --- 1. Global/Bulk Shading (Per Layout) ---
    // Iterate over all REGISTERED apertures to apply bulk settings if they match the wall.
    const allApertures = getAllApertures();

    allApertures.forEach(aperture => {
        const orientation = aperture.wallIdUpper; // N, S, E, W
        const shadeParams = allShading?.[orientation];

        if (!shadeParams) return;

        // Find the correct generic shading creator
        let deviceGroup = null;
        const { width: ww, height: wh } = aperture.dimensions;
        const sh = aperture.sillHeight;

        if (shadeParams.type === 'overhang' && shadeParams.overhang) {
            deviceGroup = createOverhang(ww, wh, shadeParams.overhang, shadeColor);
        } else if (shadeParams.type === 'lightshelf' && shadeParams.lightshelf) {
            deviceGroup = createLightShelf(ww, wh, sh, shadeParams.lightshelf, shadeColor);
        } else if (shadeParams.type === 'louver' && shadeParams.louver) {
            deviceGroup = createLouvers(ww, wh, shadeParams.louver, shadeColor, shadeParams.louver.isExterior);
        } else if (shadeParams.type === 'roller' && shadeParams.roller) {
            deviceGroup = createRoller(ww, wh, shadeParams.roller, shadeColor);
        } else if (shadeParams.type === 'imported_obj' && shadeParams.imported_obj) {
            deviceGroup = createImportedShading(shadeParams.imported_obj, shadeColor, orientation, aperture.index);
        }

        if (deviceGroup) {
            // Place at Aperture Local Position
            deviceGroup.position.copy(aperture.position);
            // Add to the correct Wall Group
            wallGroups[orientation].add(deviceGroup);
        }
    });

    // --- 2. Site/Context Shading ---
    siteShadingContextGroup.clear();
    const siteSurfaces = project.shading?.siteSurfaces || [];
    siteSurfaces.forEach(surface => {
        if (!surface.vertices || surface.vertices.length < 3) return;
        const pts = surface.vertices.map(v => new THREE.Vector3(v.x, v.y, v.z));
        const vertices = [];
        for (let k = 1; k < pts.length - 1; k++) {
            vertices.push(pts[0], pts[k], pts[k + 1]);
        }
        const geom = new THREE.BufferGeometry().setFromPoints(vertices);
        geom.computeVertexNormals();
        const mesh = new THREE.Mesh(geom, shared.shadeMat);
        mesh.userData.surfaceType = SURFACE_TYPES.SHADING_DEVICE;
        mesh.name = surface.name || 'SiteShading';
        applyClippingToMaterial(mesh.material, renderer.clippingPlanes);

        if (surface.type === 'Site') {
            siteShadingContextGroup.add(mesh);
        } else {
            shadingContainer.add(mesh);
        }
    });

    shadingObject.add(shadingContainer);

    // --- 3. Aperture-Specific Shading Devices (The Panel UI) ---
    const renderApertureDevices = async () => {
        try {
            const { project } = await import('./project.js');
            if (typeof project.getApertureShadingDevices !== 'function') return;

            const apertureDevices = await project.getApertureShadingDevices();
            if (!apertureDevices || apertureDevices.length === 0) return;

            apertureDevices.forEach(deviceConfig => {
                const aperture = getApertureById(deviceConfig.apertureId);
                if (!aperture) return;

                const wallGroup = wallGroups[aperture.wallIdUpper];
                if (!wallGroup) return;

                // Create overhangs
                if (deviceConfig.overhangs?.length > 0) {
                    deviceConfig.overhangs.forEach((overhangParams, idx) => {
                        const overhangGroup = createApertureOverhang(aperture, overhangParams, shadeColor);
                        if (overhangGroup) {
                            overhangGroup.name = `${deviceConfig.apertureId}_Overhang${idx}`;
                            overhangGroup.position.copy(aperture.position);
                            wallGroup.add(overhangGroup);
                        }
                    });
                }

                // Create fins
                if (deviceConfig.fins?.length > 0) {
                    deviceConfig.fins.forEach((finParams, idx) => {
                        const finGroup = createApertureFins(aperture, finParams, shadeColor);
                        if (finGroup) {
                            finGroup.name = `${deviceConfig.apertureId}_Fins${idx}`;
                            finGroup.position.copy(aperture.position);
                            wallGroup.add(finGroup);
                        }
                    });
                }
            });
        } catch (err) {
            console.error('[createShadingDevices] Failed to render aperture devices:', err);
        }
    };

    renderApertureDevices();
}

/**
 * Creates an overhang shading device for a specific aperture.
 * @param {object} aperture - Aperture metadata
 * @param {object} params - Overhang parameters
 * @param {string} color - Hex color string
 * @returns {THREE.Group|null} Overhang group or null if invalid
 */
function createApertureOverhang(aperture, params, color) {
    const { depth, heightAbove, tiltAngle, leftExtension, rightExtension } = params;
    const thickness = 0.05;

    if (!depth || depth <= 0) return null;

    const assembly = new THREE.Group();
    const pivot = new THREE.Group();

    const apertureHeight = aperture.dimensions.height || 2.0;
    pivot.position.y = apertureHeight / 2 + (heightAbove || 0);

    const tilt = tiltAngle !== undefined ? tiltAngle : 90;
    pivot.rotation.x = THREE.MathUtils.degToRad(tilt - 90);

    assembly.add(pivot);

    const apertureWidth = aperture.dimensions.width || 1.5;
    const totalWidth = apertureWidth + (leftExtension || 0) + (rightExtension || 0);

    const overhangGeom = new THREE.BoxGeometry(totalWidth, thickness, depth);
    const material = shared.shadeMat.clone();
    material.color.set(color);
    const overhangMesh = new THREE.Mesh(overhangGeom, material);

    overhangMesh.position.x = ((rightExtension || 0) - (leftExtension || 0)) / 2;
    overhangMesh.position.y = thickness / 2;
    overhangMesh.position.z = depth / 2;

    overhangMesh.userData.surfaceType = SURFACE_TYPES.SHADING_DEVICE;
    applyClippingToMaterial(overhangMesh.material, renderer.clippingPlanes);

    pivot.add(overhangMesh);

    return assembly;
}

/**
 * Creates fin shading devices (left and/or right) for a specific aperture.
 * @param {object} aperture - Aperture metadata
 * @param {object} params - Fin parameters (leftDepth, rightDepth, heightAbove, heightBelow)
 * @param {string} color - Hex color string for the device
 * @returns {THREE.Group|null} Fin group or null if invalid
 */
function createApertureFins(aperture, params, color) {
    const { leftDepth, rightDepth, heightAbove, heightBelow } = params;
    const finThickness = 0.05; // Default fin thickness

    if ((!leftDepth || leftDepth <= 0) && (!rightDepth || rightDepth <= 0)) {
        return null; // At least one fin must have depth
    }

    const assembly = new THREE.Group();
    const material = shared.shadeMat.clone();
    material.color.set(color);

    const apertureWidth = aperture.dimensions.width || 1.5;
    const apertureHeight = aperture.dimensions.height || 2.0;

    // Fin extends from below window bottom to above window top
    const finHeight = apertureHeight + (heightAbove || 0) + (heightBelow || 0);
    // Center point Y for the fin geometry.
    // Window Center (Local 0) is at mid-height.
    // Fin spans [-heightBelow - H/2, +heightAbove + H/2].
    // Fin Center = (SkyTop + GndBot) / 2.
    // Top = H/2 + Above.
    // Bot = -H/2 - Below.
    // Center = (H/2 + Above - H/2 - Below) / 2 = (Above - Below) / 2.
    const finYCenter = ((heightAbove || 0) - (heightBelow || 0)) / 2;

    // Left fin
    if (leftDepth && leftDepth > 0) {
        const leftFinGeom = new THREE.BoxGeometry(finThickness, finHeight, leftDepth);
        const leftFinMesh = new THREE.Mesh(leftFinGeom, material.clone());
        leftFinMesh.position.x = -apertureWidth / 2 - finThickness / 2;
        leftFinMesh.position.y = finYCenter;
        leftFinMesh.position.z = leftDepth / 2; // Push outward

        leftFinMesh.userData.surfaceType = SURFACE_TYPES.SHADING_DEVICE;
        applyClippingToMaterial(leftFinMesh.material, renderer.clippingPlanes);
        assembly.add(leftFinMesh);
    }

    // Right fin
    if (rightDepth && rightDepth > 0) {
        const rightFinGeom = new THREE.BoxGeometry(finThickness, finHeight, rightDepth);
        const rightFinMesh = new THREE.Mesh(rightFinGeom, material.clone());
        rightFinMesh.position.x = apertureWidth / 2 + finThickness / 2;
        rightFinMesh.position.y = finYCenter;
        rightFinMesh.position.z = rightDepth / 2; // Push outward

        rightFinMesh.userData.surfaceType = SURFACE_TYPES.SHADING_DEVICE;
        applyClippingToMaterial(rightFinMesh.material, renderer.clippingPlanes);
        assembly.add(rightFinMesh);
    }

    // No manual rotation or position copy here - parent adds it to wall group and sets position.

    return assembly;
}

/**
 * Creates a single overhang device.
 */
function createOverhang(winWidth, winHeight, params, color) {
    const { distAbove, tilt, depth, leftExtension, rightExtension, thick } = params; if (depth <= 0) return null;

    const assembly = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.position.y = (winHeight / 2) + distAbove;
    // Adjust rotation: 90° is flat (parallel to ground), 0° is vertical down.
    pivot.rotation.x = THREE.MathUtils.degToRad(tilt - 90);
    assembly.add(pivot);

    const overhangGeom = new THREE.BoxGeometry(winWidth + leftExtension + rightExtension, thick, depth);
    const material = shared.shadeMat.clone();
    material.color.set(color);
    const overhangMesh = new THREE.Mesh(overhangGeom, material);
    // Adjust horizontal position based on asymmetric extensions
    overhangMesh.position.x = (rightExtension - leftExtension) / 2;
    overhangMesh.userData.surfaceType = SURFACE_TYPES.SHADING_DEVICE;
    applyClippingToMaterial(overhangMesh.material, renderer.clippingPlanes);

    overhangMesh.position.y = thick / 2;
    overhangMesh.position.z = depth / 2;

    pivot.add(overhangMesh);
    return assembly;
}

/**
 * Creates a light shelf assembly.
 */
function createLightShelf(winWidth, winHeight, sillHeight, params, color) {
    const assembly = new THREE.Group();
    const { placeExt, placeInt, placeBoth, depthExt, depthInt, tiltExt, tiltInt, distBelowExt, distBelowInt, thickExt, thickInt } = params;
    const material = shared.shadeMat.clone();
    material.color.set(color);
    applyClippingToMaterial(material, renderer.clippingPlanes);

    if ((placeExt || placeBoth) && depthExt > 0) {
        const pivot = new THREE.Group();
        const shelfMesh = new THREE.Mesh(new THREE.BoxGeometry(winWidth, thickExt, depthExt), material);
        shelfMesh.userData.surfaceType = SURFACE_TYPES.SHADING_DEVICE;

        // External shelf: position it outward along the local +Z axis.
        shelfMesh.position.z = depthExt / 2;

        pivot.position.y = (winHeight / 2) - distBelowExt;
        pivot.rotation.x = THREE.MathUtils.degToRad(tiltExt);
        pivot.add(shelfMesh);
        assembly.add(pivot);
    }
    if ((placeInt || placeBoth) && depthInt > 0) {
        const pivot = new THREE.Group();
        const shelfMesh = new THREE.Mesh(new THREE.BoxGeometry(winWidth, thickInt, depthInt), material);
        shelfMesh.userData.surfaceType = SURFACE_TYPES.SHADING_DEVICE;

        // Internal shelf: position it inward along the local -Z axis.
        shelfMesh.position.z = -depthInt / 2;

        pivot.position.y = (winHeight / 2) - distBelowInt;
        pivot.rotation.x = THREE.MathUtils.degToRad(tiltInt);
        pivot.add(shelfMesh);
        assembly.add(pivot);
    }
    return assembly;
}

/**
 * Creates a louver assembly.
 */
function createLouvers(winWidth, winHeight, params, color, isExterior = true) {
    const { isHorizontal, slatWidth, slatSep, slatThick, slatAngle, distToGlass } = params;
    if (slatWidth <= 0 || slatSep <= 0) return null;

    const assembly = new THREE.Group();
    const material = shared.shadeMat.clone();
    material.color.set(color);
    applyClippingToMaterial(material, renderer.clippingPlanes);

    // The parent group is rotated so its local Z-axis always points outward.
    // A positive Z is outward, a negative Z is inward.
    const zOffset = isExterior ? distToGlass : -distToGlass;
    const angleRad = THREE.MathUtils.degToRad(slatAngle);

    if (isHorizontal) {
        const slatGeom = new THREE.BoxGeometry(winWidth, slatThick, slatWidth);
        const numSlats = Math.floor(winHeight / slatSep);
        for (let i = 0; i < numSlats; i++) {
            const pivot = new THREE.Group();
            const slat = new THREE.Mesh(slatGeom, material);
            slat.userData.surfaceType = SURFACE_TYPES.SHADING_DEVICE;
            pivot.position.set(0, (i * slatSep + slatSep / 2) - winHeight / 2, zOffset);
            pivot.rotation.x = angleRad;
            pivot.add(slat);
            assembly.add(pivot);
        }
    } else { // Vertical
        const slatGeom = new THREE.BoxGeometry(slatThick, winHeight, slatWidth);
        const numSlats = Math.floor(winWidth / slatSep);
        for (let i = 0; i < numSlats; i++) {
            const pivot = new THREE.Group();
            const slat = new THREE.Mesh(slatGeom, material);
            slat.userData.surfaceType = SURFACE_TYPES.SHADING_DEVICE;
            pivot.position.set((i * slatSep + slatSep / 2) - winWidth / 2, 0, zOffset);
            pivot.rotation.y = angleRad;
            pivot.add(slat);
            assembly.add(pivot);
        }
    }
    return assembly;
}

/**
 * Creates a single roller shade device.
 */
function createRoller(winWidth, winHeight, params, color) {
    const {
        topOpening, bottomOpening, leftOpening, rightOpening,
        distToGlass, thickness
    } = params;

    const rollerThickness = Math.max(0.001, thickness);
    const rollerWidth = winWidth - leftOpening - rightOpening;
    const rollerHeight = winHeight - topOpening - bottomOpening;

    if (rollerWidth <= 0 || rollerHeight <= 0) return null;

    const assembly = new THREE.Group();
    const rollerGeom = new THREE.BoxGeometry(rollerWidth, rollerHeight, rollerThickness);
    const material = shared.shadeMat.clone();
    material.color.set(color);
    material.transparent = true;
    material.opacity = 0.7; // Make it semi-transparent for visualization
    applyClippingToMaterial(material, renderer.clippingPlanes);

    const rollerMesh = new THREE.Mesh(rollerGeom, material);
    rollerMesh.userData.surfaceType = SURFACE_TYPES.SHADING_DEVICE;

    // The origin (0,0,0) of this assembly is the window's center.
    // Calculate roller center relative to window center.
    // Window Bottom = -winHeight/2.
    // Roller Bottom = Window Bottom + bottomOpening.
    // Roller Center Y = Roller Bottom + rollerHeight/2.
    //                = -winHeight/2 + bottomOpening + rollerHeight/2.

    // Window Left = -winWidth/2.
    // Roller Left = Window Left + leftOpening.
    // Roller Center X = Roller Left + rollerWidth/2.
    //                = -winWidth/2 + leftOpening + rollerWidth/2.

    const posX = -winWidth / 2 + leftOpening + rollerWidth / 2;
    const posY = -winHeight / 2 + bottomOpening + rollerHeight / 2;
    // Positioned inside the room (negative local Z is inward)
    const posZ = -distToGlass - (rollerThickness / 2);

    rollerMesh.position.set(posX, posY, posZ);

    assembly.add(rollerMesh);
    return assembly;
}

/**
 * Clears any imported model from the scene.
 */
export function clearImportedModel() {
    if (currentImportedModel) {
        clearGroup(importedModelObject);
        currentImportedModel = null;
    }
}

/**
 * Loads an OBJ model into the scene.
 * @param {string} objContent - The string content of the .obj file.
 * @param {string|null} mtlContent - The string content of the .mtl file.
 * @param {object} options - Import options like scale and center.
 * @returns {Promise<Array<object>>} A promise that resolves with an array of material info.
 */
export async function loadImportedModel(objContent, mtlContent, options) {
    clearImportedModel(); // Clear any previous model

    const objLoader = new OBJLoader();
    const mtlLoader = new MTLLoader();

    if (mtlContent) {
        const materials = mtlLoader.parse(mtlContent, '');
        materials.preload();
        objLoader.setMaterials(materials);
    }

    const object = objLoader.parse(objContent);
    currentImportedModel = object;

    // --- Scaling and Centering ---
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());

    if (options.center) {
        object.position.sub(center);
    }

    if (options.scale && options.scale !== 1.0) {
        object.scale.setScalar(options.scale);
    }

    object.traverse(child => {
        if (child.isMesh) {
            // Ensure material properties are suitable for our scene
            if (child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(mat => {
                    mat.side = THREE.DoubleSide;
                    applyClippingToMaterial(mat, renderer.clippingPlanes);
                });
            }
        }
    });

    importedModelObject.add(object);
    scheduleUpdate();

    // Extract material info for the tagger UI
    const materialInfo = [];
    const seenMaterials = new Set();
    object.traverse(child => {
        if (child.isMesh && child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach(mat => {
                if (mat.name && !seenMaterials.has(mat.name)) {
                    materialInfo.push({ name: mat.name, color: mat.color });
                    seenMaterials.add(mat.name);
                }
            });
        }
    });

    return materialInfo;
}

/**
 * Applies surface type tags to the materials of the imported model.
 * @param {Map<string, string>} tagMap - A map of material names to surface types.
 */
export function applySurfaceTags(tagMap) {
    if (!currentImportedModel) return;

    currentImportedModel.traverse(child => {
        if (child.isMesh && child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach(mat => {
                const surfaceType = tagMap.get(mat.name);
                if (surfaceType && surfaceType !== 'IGNORE') {
                    mat.userData.surfaceType = surfaceType;
                    mat.visible = true;
                } else {
                    // If ignored or not in map, make it invisible
                    mat.visible = false;
                }
            });
        }
    });
}

/**
 * Creates a shading device from an imported OBJ file.
 */
/**
 * Creates a shading device from an imported OBJ file.
 */
async function createImportedShading(params, color, orientation, index) {
    const { project } = await import('./project.js');
    const fileKey = `shading-obj-file-${orientation.toLowerCase()}`;
    const objFile = project.simulationFiles[fileKey];

    if (!objFile || !objFile.content) return null;

    const loader = new OBJLoader();
    const objectGroup = loader.parse(objFile.content);

    const material = shared.shadeMat.clone();
    material.color.set(color);
    applyClippingToMaterial(material, renderer.clippingPlanes);

    objectGroup.traverse(child => {
        if (child.isMesh) {
            child.material = material;
            child.userData.surfaceType = SURFACE_TYPES.SHADING_DEVICE;
            child.userData.isSelectable = true; // For raycasting
            child.userData.parentWall = orientation;
            child.userData.parentIndex = index;
        }
    });

    // Apply transformations from UI to the OBJECT (Local Offset/Rotation/Scale)
    objectGroup.position.set(params.position.x, params.position.y, params.position.z);
    objectGroup.rotation.set(
        THREE.MathUtils.degToRad(params.rotation.x),
        THREE.MathUtils.degToRad(params.rotation.y),
        THREE.MathUtils.degToRad(params.rotation.z)
    );
    objectGroup.scale.set(params.scale.x, params.scale.y, params.scale.z);

    // Create an anchor group to be placed at the window position
    const anchor = new THREE.Group();
    anchor.add(objectGroup);

    // Add to our list for selection and gizmo control (Allowing user to edit the OFFSET)
    importedShadingObjects.push(objectGroup);

    return anchor;
}

/**
 * Updates the colors of the sensor grid points based on results data.
 * @param {number[]} resultsData - An array of numerical results.
 */
export function updateSensorGridColors(resultsData) {
    if (sensorMeshes.length === 0) {
        return;
    }

    const defaultColor = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--illuminance-grid-color').trim());

    if (!resultsData || resultsData.length === 0) {
        // Clear colors if no data is provided
        sensorMeshes.forEach(mesh => {
            for (let i = 0; i < mesh.count; i++) {
                mesh.setColorAt(i, defaultColor);
            }
            if (mesh.instanceColor) {
                mesh.instanceColor.needsUpdate = true;
            }
        });
        return;
    }

    const tempColor = new THREE.Color();
    let dataIndex = 0;

    sensorMeshes.forEach(mesh => {
        if (dataIndex >= resultsData.length) return;

        for (let i = 0; i < mesh.count; i++) {
            if (dataIndex >= resultsData.length) break;

            const value = resultsData[dataIndex];
            const colorHex = resultsManager.getColorForValue(value);

            mesh.setColorAt(i, tempColor.set(colorHex));
            dataIndex++;
        }
        if (mesh.instanceColor) {
            mesh.instanceColor.needsUpdate = true;
        }
    });

    if (dataIndex < resultsData.length) {
        console.warn(`Mismatch in sensor points and results. ${dataIndex} points colored, ${resultsData.length} results provided.`);
    }
}



/**
 * Clears any existing wall highlight by restoring its original material.
 */
export function clearWallHighlights() {
    highlightedWalls.forEach(({ object, originalMaterial }) => {
        if (object) {
            object.material = originalMaterial;
        }
    });
    highlightedWalls = [];
}

/**
 * Highlights a selected wall by swapping its material.
 * @param {THREE.Mesh} wallObject - The wall mesh to highlight.
 * @param {boolean} [clearPrevious=true] - If true, clears previous highlights first.
 */
export function highlightWall(wallObject, clearPrevious = true) {
    if (clearPrevious) {
        clearWallHighlights();
    }

    if (wallObject && wallObject.material) {
        // Check if already highlighted to avoid duplicates
        const alreadyHighlighted = highlightedWalls.some(h => h.object === wallObject);
        if (!alreadyHighlighted) {
            highlightedWalls.push({
                object: wallObject,
                originalMaterial: wallObject.material
            });
            wallObject.material = highlightMaterial;
        }
    }
}

/**
 * Creates visual helpers (semi-transparent planes and outlines) for the
 * EN 12464-1 task and surrounding areas on the floor grid.
 * @param {number} W - Room width.
 * @param {number} L - Room length.
 * @param {THREE.Group} container - The group to add the helpers to.
 * @param {object} gridParams - The parameters object from getSensorGridParams.
 * @private
 */
function _createTaskAreaVisuals(W, L, container, gridParams) {
    const dom = getDom();
    const floorParams = gridParams?.illuminance.floor;

    if (!dom['grid-floor-toggle']?.checked || !floorParams?.isTaskArea) {
        return; // Only draw if the floor grid and task area are enabled
    }

    const offset = parseFloat(dom['floor-grid-offset'].value);
    const vizHeight = offset + 0.005; // Position slightly above the grid offset to prevent z-fighting

    const createAreaPlane = (width, depth, material) => {
        const planeGeom = new THREE.PlaneGeometry(width, depth);
        const planeMesh = new THREE.Mesh(planeGeom, material);
        planeMesh.rotation.x = -Math.PI / 2; // Orient flat on the XY plane

        const outlineGeom = new THREE.EdgesGeometry(planeGeom);
        const outline = new THREE.LineSegments(outlineGeom, new THREE.LineBasicMaterial({ color: material.color, linewidth: 2 }));

        const group = new THREE.Group();
        group.add(planeMesh, outline);
        return group;
    };

    // 1. Create Task Area visual
    const task = floorParams.task;
    if (task.width > 0 && task.depth > 0) {
        const taskAreaVisual = createAreaPlane(task.width, task.depth, shared.taskAreaMat);
        taskAreaVisual.position.set(task.x + task.width / 2, vizHeight, task.z + task.depth / 2);
        container.add(taskAreaVisual);
    }

    // 2. Create Surrounding Area visual
    if (floorParams.hasSurrounding) {
        const band = floorParams.surroundingWidth;
        const surroundingWidth = Math.min(W, task.width + 2 * band);
        const surroundingDepth = Math.min(L, task.depth + 2 * band);
        const surroundingX = Math.max(0, task.x - band);
        const surroundingZ = Math.max(0, task.z - band);

        if (surroundingWidth > 0 && surroundingDepth > 0) {
            const surroundingAreaVisual = createAreaPlane(surroundingWidth, surroundingDepth, shared.surroundingAreaMat);
            surroundingAreaVisual.position.set(surroundingX + surroundingWidth / 2, vizHeight - 0.001, surroundingZ + surroundingDepth / 2);
            // Add to the main container, it will be rendered underneath the task area plane
            container.add(surroundingAreaVisual);
        }
    }
}

/**
 * Attaches the daylighting sensor gizmo to the sensor selected via the UI toggles.
 * This function assumes the sensor meshes already exist and are correctly positioned.
 */
export function attachGizmoToSelectedSensor() {
    // This function assumes the sensor meshes already exist and are correct.
    const dom = getDom(); // We need the DOM to see which toggle is checked.
    const gizmo1Checked = dom['daylight-sensor1-gizmo-toggle']?.checked;
    const gizmo2Checked = dom['daylight-sensor2-gizmo-toggle']?.checked;

    let objectToAttach = null;
    if (gizmo1Checked && daylightingSensorMeshes[0]) {
        objectToAttach = daylightingSensorMeshes[0];
    } else if (gizmo2Checked && daylightingSensorMeshes[1]) {
        objectToAttach = daylightingSensorMeshes[1];
    }

    if (objectToAttach && sensorTransformControls.object !== objectToAttach) {
        sensorTransformControls.attach(objectToAttach);
    } else if (!objectToAttach) {
        sensorTransformControls.detach();
    }
}

/**
 * Creates and adds a furniture asset to the scene.
 * @param {string} assetType - The type of asset to create (e.g., 'desk', 'chair').
 * @param {THREE.Vector3} position - The initial position for the asset.
 * @param {boolean} [isWorldPosition=true] - If true, the position is treated as world coordinates and converted. If false, it's used directly as local coordinates.
 * @returns {THREE.Mesh|null} The created mesh, or null if asset type is unknown.
 */
export function addFurniture(assetType, position, isWorldPosition = true) {
    const dom = getDom();
    const material = shared.furnitureMat;
    applyClippingToMaterial(material, renderer.clippingPlanes);
    let geometry;
    let mesh;

    switch (assetType) {
        case 'desk':
            geometry = new THREE.BoxGeometry(1.2, 0.05, 0.75); // W, H, D
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.y = 0.725;
            const legGeom = new THREE.BoxGeometry(0.05, 0.7, 0.05);
            const leg1 = new THREE.Mesh(legGeom, material); leg1.position.set(-0.55, -0.375, -0.35);
            const leg2 = new THREE.Mesh(legGeom, material); leg2.position.set(0.55, -0.375, -0.35);
            const leg3 = new THREE.Mesh(legGeom, material); leg3.position.set(-0.55, -0.375, 0.35);
            const leg4 = new THREE.Mesh(legGeom, material); leg4.position.set(0.55, -0.375, 0.35);
            mesh.add(leg1, leg2, leg3, leg4);
            break;
        case 'chair':
            geometry = new THREE.BoxGeometry(0.4, 0.04, 0.4);
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.y = 0.42;
            const backGeom = new THREE.BoxGeometry(0.4, 0.5, 0.04);
            const back = new THREE.Mesh(backGeom, material);
            back.position.set(0, 0.27, -0.18);
            back.rotation.x = 0.1;
            mesh.add(back);
            break;
        case 'partition':
            geometry = new THREE.BoxGeometry(1.2, 1.5, 0.05);
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.y = 0.75;
            break;
        case 'shelf':
            geometry = new THREE.BoxGeometry(0.9, 1.8, 0.3);
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.y = 0.9;
            break;
        default:
            return null;
    }

    mesh.userData = {
        isFurniture: true,
        assetType: assetType,
    };

    let localPosition;
    if (isWorldPosition) {
        // The drop position is in world coordinates. We need to convert it to the
        // local coordinate system of the parent `furnitureObject`.
        localPosition = furnitureObject.worldToLocal(position.clone());
    } else {
        // The position is already in local coordinates relative to the room center.
        localPosition = position;
    }
    mesh.position.add(localPosition);

    furnitureContainer.add(mesh);

    return mesh;
}

/**
 * Creates a massing block with customizable parameters and adds it to the scene's context group.
 * @param {object} params - Configuration parameters for the massing block.
 * @param {string} params.shape - Shape type: 'box', 'cylinder', 'pyramid', 'sphere'.
 * @param {number} params.width - Width/X dimension in meters.
 * @param {number} params.depth - Depth/Z dimension in meters.
 * @param {number} params.height - Height/Y dimension in meters.
 * @param {number} params.radius - Radius for cylinder/sphere shapes.
 * @param {number} params.positionX - X position in meters.
 * @param {number} params.positionY - Y position in meters.
 * @param {number} params.positionZ - Z position in meters.
 * @param {string} params.name - Optional name for the massing block.
 * @returns {THREE.Mesh|THREE.Group} The created mesh or group object for the massing block.
 */
export function addMassingBlock(params = {}) {
    const {
        shape = 'box',
        width = 10,
        depth = 10,
        height = 15,
        radius = 5,
        positionX = 20,
        positionY = height / 2,
        positionZ = 0,
        name = `Massing Block ${contextObject.children.length + 1}`
    } = params;

    let geometry, mesh;

    // Create geometry based on shape
    switch (shape) {
        case 'cylinder':
            geometry = new THREE.CylinderGeometry(radius, radius, height, 16);
            break;
        case 'pyramid':
            // Create pyramid using cone geometry
            geometry = new THREE.ConeGeometry(radius, height, 4);
            break;
        case 'sphere':
            geometry = new THREE.SphereGeometry(radius, 16, 12);
            break;
        case 'box':
        default:
            geometry = new THREE.BoxGeometry(width, height, depth);
            break;
    }

    // Use the same shared material as OSM context buildings
    const material = shared.contextMat.clone();
    applyClippingToMaterial(material, renderer.clippingPlanes);

    mesh = new THREE.Mesh(geometry, material);

    // Set userData for identification during raycasting and saving
    mesh.userData = {
        isContext: true,
        isMassingBlock: true,
        shape: shape,
        width: width,
        depth: depth,
        height: height,
        radius: radius,
        name: name,
        id: generateContextObjectId(),
        type: 'mass',
        createdAt: new Date().toISOString(),
        position: { x: positionX, y: positionY, z: positionZ }
    };

    // Position the mesh
    mesh.position.set(positionX, positionY, positionZ);

    // For pyramid (cone), adjust position to sit on ground
    if (shape === 'pyramid') {
        mesh.position.y = height / 2;
    }

    contextObject.add(mesh);

    // Register the object in our management system
    registerContextObject(mesh);

    return mesh;
}

/**
 * Generates a unique ID for a context object.
 * @returns {string} A unique identifier.
 */
function generateContextObjectId() {
    return `ctx_${nextContextObjectId++}_${Date.now()}`;
}

/**
 * Registers a context object in the management system.
 * @param {THREE.Object3D} object - The context object to register.
 */
export function registerContextObject(object) {
    if (!object.userData.id) {
        object.userData.id = generateContextObjectId();
    }
    contextObjects.set(object.userData.id, object);
    updateContextObjectUI();
}

/**
 * Unregisters a context object from the management system.
 * @param {string} id - The ID of the object to unregister.
 */
export function unregisterContextObject(id) {
    const object = contextObjects.get(id);
    if (object) {
        // Remove from scene
        if (object.parent) {
            object.parent.remove(object);
        }
        // Remove from our registry
        contextObjects.delete(id);
        updateContextObjectUI();
    }
}

/**
 * Gets all context objects.
 * @returns {Map} The context objects map.
 */
export function getContextObjects() {
    return contextObjects;
}

/**
 * Gets a context object by ID.
 * @param {string} id - The object ID.
 * @returns {THREE.Object3D|null} The context object or null if not found.
 */
export function getContextObjectById(id) {
    return contextObjects.get(id) || null;
}

/**
 * Deletes a context object by ID.
 * @param {string} id - The ID of the object to delete.
 * @returns {boolean} True if the object was deleted, false otherwise.
 */
export function deleteContextObject(id) {
    if (contextObjects.has(id)) {
        unregisterContextObject(id);
        return true;
    }
    return false;
}

/**
 * Copies a context object.
 * @param {string} id - The ID of the object to copy.
 * @param {object} offset - Optional position offset for the copy.
 * @returns {THREE.Object3D|null} The copied object or null if original not found.
 */
export function copyContextObject(id, offset = { x: 1, y: 0, z: 1 }) {
    const original = contextObjects.get(id);
    if (!original) return null;

    // Clone the geometry and create new object
    const clonedGeometry = original.geometry.clone();
    const material = original.material.clone();
    const copy = new THREE.Mesh(clonedGeometry, material);

    // Copy userData and update it
    copy.userData = { ...original.userData };
    copy.userData.id = generateContextObjectId();
    copy.userData.name = `${original.userData.name} Copy`;
    copy.userData.createdAt = new Date().toISOString();
    copy.userData.isCopy = true;

    // Apply offset to position
    copy.position.copy(original.position).add(new THREE.Vector3(offset.x, offset.y, offset.z));

    contextObject.add(copy);
    registerContextObject(copy);

    return copy;
}

/**
 * Gets properties of a context object.
 * @param {string} id - The object ID.
 * @returns {object|null} Object properties or null if not found.
 */
export function getContextObjectProperties(id) {
    const object = contextObjects.get(id);
    if (!object) return null;

    const bbox = new THREE.Box3().setFromObject(object);
    const dimensions = {
        width: bbox.max.x - bbox.min.x,
        height: bbox.max.y - bbox.min.y,
        depth: bbox.max.z - bbox.min.z
    };

    let volume = 0;
    switch (object.userData.shape) {
        case 'box':
            volume = object.userData.width * object.userData.height * object.userData.depth;
            break;
        case 'cylinder':
            volume = Math.PI * object.userData.radius * object.userData.radius * object.userData.height;
            break;
        case 'sphere':
            volume = (4 / 3) * Math.PI * object.userData.radius * object.userData.radius * object.userData.radius;
            break;
        case 'pyramid':
            volume = (1 / 3) * Math.PI * object.userData.radius * object.userData.radius * object.userData.height;
            break;
    }

    return {
        id: object.userData.id,
        name: object.userData.name,
        type: object.userData.type,
        shape: object.userData.shape,
        position: { ...object.position },
        dimensions: dimensions,
        volume: volume,
        createdAt: object.userData.createdAt,
        isCopy: object.userData.isCopy || false
    };
}

/**
 * Updates the material for all context objects of a specific type.
 * @param {string} type - The object type ('mass', 'building', etc.).
 * @param {THREE.Material} material - The new material to apply.
 */
export function updateContextObjectsMaterial(type, material) {
    contextObjects.forEach(object => {
        if (object.userData.type === type) {
            object.material = material;
        }
    });
}

/**
 * Gets all context objects of a specific type.
 * @param {string} type - The object type to filter by.
 * @returns {Array} Array of matching objects.
 */
export function getContextObjectsByType(type) {
    const objects = [];
    contextObjects.forEach(object => {
        if (object.userData.type === type) {
            objects.push(object);
        }
    });
    return objects;
}

/**
 * Performs bulk operations on selected context objects.
 * @param {string} operation - The operation type ('delete', 'copy', 'changeMaterial').
 * @param {Array} objectIds - Array of object IDs to operate on.
 * @param {object} params - Operation parameters.
 * @returns {object} Result of the operation.
 */
export function performBulkOperation(operation, objectIds, params = {}) {
    const results = {
        success: [],
        failed: [],
        count: objectIds.length
    };

    switch (operation) {
        case 'delete':
            objectIds.forEach(id => {
                if (deleteContextObject(id)) {
                    results.success.push(id);
                } else {
                    results.failed.push(id);
                }
            });
            break;

        case 'copy':
            const offset = params.offset || { x: 1, y: 0, z: 1 };
            objectIds.forEach(id => {
                const copy = copyContextObject(id, offset);
                if (copy) {
                    results.success.push(copy.userData.id);
                } else {
                    results.failed.push(id);
                }
            });
            break;

        case 'changeMaterial':
            const material = params.material;
            if (material) {
                objectIds.forEach(id => {
                    const object = contextObjects.get(id);
                    if (object) {
                        object.material = material;
                        results.success.push(id);
                    } else {
                        results.failed.push(id);
                    }
                });
            }
            break;
    }

    // Update UI after bulk operations
    updateContextObjectUI();

    return results;
}

/**
 * Updates the context object management UI.
 * This function should be called from ui.js to refresh the object list.
 */
export function updateContextObjectUI() {
    // This will be implemented in ui.js to update the DOM
    if (typeof window !== 'undefined' && window.updateContextObjectUI) {
        window.updateContextObjectUI();
    }
}

/**
 * Creates transparent planes on the exterior of the room to act as resize handles.
 */
export function createResizeHandles() {
    clearGroup(resizeHandlesObject);
    const dom = getDom();
    if (!dom['resize-mode-toggle'] || !dom['resize-mode-toggle'].checked) {
        return; // Don't create handles if mode is off
    }

    const { W, L, H } = readParams();

    const handleMaterial = new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.2, // Slightly increased opacity
        side: THREE.DoubleSide,
        depthTest: false,
    });

    const { wallThickness } = readParams();
    const handles = [
        // Positions are now calculated to be outside the wall thickness
        { name: 'wall-handle-east', w: L, h: H, pos: [W / 2 + wallThickness + 0.01, H / 2, 0], axis: 'x', dir: 1 },
        { name: 'wall-handle-west', w: L, h: H, pos: [-W / 2 - wallThickness - 0.01, H / 2, 0], axis: 'x', dir: -1 },
        { name: 'wall-handle-south', w: W, h: H, pos: [0, H / 2, L / 2 + wallThickness + 0.01], axis: 'z', dir: 1 },
        { name: 'wall-handle-north', w: W, h: H, pos: [0, H / 2, -L / 2 - wallThickness - 0.01], axis: 'z', dir: -1 },
        { name: 'wall-handle-top', w: W, h: L, pos: [0, H + 0.01, 0], axis: 'y', dir: 1 },
    ];

    handles.forEach(h => {
        const geometry = new THREE.PlaneGeometry(h.w, h.h);
        const plane = new THREE.Mesh(geometry, handleMaterial.clone());
        plane.position.set(...h.pos);
        if (h.axis === 'x') plane.rotation.y = Math.PI / 2;
        if (h.axis === 'y') plane.rotation.x = -Math.PI / 2;

        plane.userData = {
            isResizeHandle: true,
            axis: h.axis, // 'x', 'y', or 'z'
            direction: h.dir // 1 or -1
        };
        resizeHandlesObject.add(plane);
    });
}

/**
 * Clears all context objects from the scene.
 */
export function clearContextObjects() {
    clearGroup(contextObject);
}

/**
 * Updates the material for all context buildings based on UI controls.
 */
export function updateContextMaterial() {
    const dom = getDom();
    const refl = parseFloat(dom['context-refl']?.value || 0.2);
    // We'll use a simple gray color based on reflectance for the 3D view
    shared.contextMat.color.setScalar(refl);
}

/**
 * Creates 3D building masses from parsed OpenStreetMaps data.
 * @param {object} osmData - The raw JSON data from the Overpass API.
 * @param {number} centerLat - The latitude of the project center.
 * @param {number} centerLon - The longitude of the project center.
 */
export function createContextFromOsm(osmData, centerLat, centerLon) {
    clearContextObjects();

    const nodes = new Map();
    osmData.elements.forEach(el => {
        if (el.type === 'node') {
            nodes.set(el.id, { lat: el.lat, lon: el.lon });
        }
    });

    osmData.elements.forEach(el => {
        if (el.type === 'way' && el.tags?.building && el.nodes) {
            const points = [];
            el.nodes.forEach(nodeId => {
                const node = nodes.get(nodeId);
                if (node) {
                    // Convert lat/lon to meters from the center point
                    const metersPerLat = 111132.954 - 559.822 * Math.cos(2 * centerLat) + 1.175 * Math.cos(4 * centerLat);
                    const metersPerLon = 111319.488 * Math.cos(centerLat * Math.PI / 180);
                    const x = (node.lon - centerLon) * metersPerLon;
                    const z = -(node.lat - centerLat) * metersPerLat; // Z is negative latitude
                    points.push(new THREE.Vector2(x, z));
                }
            });

            if (points.length > 2) {
                const shape = new THREE.Shape(points);
                const height = parseFloat(el.tags.height) || (parseFloat(el.tags['building:levels']) || 3) * 3.5;

                const extrudeSettings = { depth: height, bevelEnabled: false };
                const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
                geometry.translate(0, 0, -height); // Move extrusion origin to the top
                geometry.rotateX(Math.PI / 2); // Rotate to stand up (Y-up)

                const building = new THREE.Mesh(geometry, shared.contextMat);
                contextObject.add(building);
            }
        }
    });

    const buildingsCreated = contextObject.children.length > 0;
    if (!buildingsCreated && osmData.elements.length > 0) {
        import('./ui.js').then(({ showAlert }) => {
            showAlert('OSM data fetched successfully, but no building footprints were found in the specified area.', 'No Buildings Found');
        });
    }

    updateContextMaterial(); // Apply initial material color
}

/**
 * Creates and adds a vegetation asset to the scene.
 * @param {string} assetType - The type of asset to create (e.g., 'tree-deciduous').
 * @param {THREE.Vector3} position - The initial position for the asset.
 * @param {boolean} [isWorldPosition=true] - If true, the position is treated as world coordinates and converted. If false, it's used directly as local coordinates.
 * @returns {THREE.Group|null} The created group object, or null if asset type is unknown.
 */
export function addVegetation(assetType, position, isWorldPosition = true) {
    console.log(`[DEBUG] addVegetation function started. Type: "${assetType}", Position:`, position, `Is World: ${isWorldPosition}`);

    const treeGroup = new THREE.Group();
    let geometryCreated = false;

    switch (assetType) {
        case 'tree-deciduous': {
            const trunkGeom = new THREE.CylinderGeometry(0.15, 0.2, 2.5, 8);
            const trunkMesh = new THREE.Mesh(trunkGeom, shared.furnitureMat.clone()); // Use clone for safety
            trunkMesh.userData.surfaceType = 'VEGETATION_TRUNK';
            trunkMesh.position.y = 1.25;

            const canopyGeom = new THREE.SphereGeometry(1.5, 12, 8);
            const canopyMesh = new THREE.Mesh(canopyGeom, shared.vegetationCanopyMat.clone());
            canopyMesh.userData.surfaceType = 'VEGETATION_CANOPY';
            canopyMesh.position.y = 3.5;

            treeGroup.add(trunkMesh, canopyMesh);
            geometryCreated = true;
            break;
        }
        case 'tree-coniferous': {
            const conTrunkGeom = new THREE.CylinderGeometry(0.2, 0.25, 2.0, 8);
            const conTrunkMesh = new THREE.Mesh(conTrunkGeom, shared.furnitureMat.clone()); // Use clone for safety
            conTrunkMesh.userData.surfaceType = 'VEGETATION_TRUNK';
            conTrunkMesh.position.y = 1.0;

            const canopyGeomCone = new THREE.ConeGeometry(1.2, 4.0, 12);
            const canopyMeshCone = new THREE.Mesh(canopyGeomCone, shared.vegetationCanopyMat.clone());
            canopyMeshCone.userData.surfaceType = 'VEGETATION_CANOPY';
            canopyMeshCone.position.y = 2.0 + 4.0 / 2;

            treeGroup.add(conTrunkMesh, canopyMeshCone);
            geometryCreated = true;
            break;
        }
        case 'bush': {
            const bushGeom = new THREE.SphereGeometry(0.7, 10, 6);
            const bushMesh = new THREE.Mesh(bushGeom, shared.vegetationCanopyMat.clone());
            bushMesh.userData.surfaceType = 'VEGETATION_CANOPY';
            bushMesh.position.y = 0.7;
            treeGroup.add(bushMesh);
            geometryCreated = true;
            break;
        }
        default:
            console.error(`[DEBUG] Unknown vegetation asset type in switch: ${assetType}`);
            return null;
    }

    if (!geometryCreated) {
        console.error('[DEBUG] Geometry was not created for the asset type.');
        return null;
    }
    console.log('[DEBUG] Geometry created. Resulting treeGroup:', treeGroup);

    treeGroup.userData = {
        isVegetation: true,
        assetType: assetType,
    };

    let localPosition;
    if (isWorldPosition) {
        // The drop position is in world coordinates. Convert it to the local
        // coordinate system of the parent `vegetationObject`.
        localPosition = vegetationObject.worldToLocal(position.clone());
    } else {
        // The position is already in local coordinates relative to the room center.
        localPosition = position;
    }
    treeGroup.position.add(localPosition);

    vegetationContainer.add(treeGroup);

    // Force matrix update to get immediate world position
    treeGroup.updateMatrixWorld(true);
    const finalWorldPos = new THREE.Vector3();
    treeGroup.getWorldPosition(finalWorldPos);
    console.log('[DEBUG] Final calculated world position of new object:', finalWorldPos);

    return treeGroup;
}

/**
 * Creates and adds an imported asset (.obj) to the scene.
 * @param {string} objContent - The string content of the .obj file.
 * @param {string|null} mtlContent - The string content of the .mtl file.
 * @param {string} assetType - The type of asset ('custom-obj-furniture' or 'custom-obj-vegetation').
 * @returns {Promise<THREE.Group|null>} The created group, or null on failure.
 */
export async function addImportedAsset(objContent, mtlContent, assetType) {
    const objLoader = new OBJLoader();

    if (mtlContent) {
        const mtlLoader = new MTLLoader();
        const materials = mtlLoader.parse(mtlContent, '');
        materials.preload();
        objLoader.setMaterials(materials);
    }

    const objectGroup = objLoader.parse(objContent);

    // Center the geometry before adding to the scene
    const box = new THREE.Box3().setFromObject(objectGroup);
    const center = box.getCenter(new THREE.Vector3());
    objectGroup.position.sub(center);

    let isFurniture = assetType === 'custom-obj-furniture';
    let isVegetation = assetType === 'custom-obj-vegetation';

    // Apply a standard material for simulation consistency and assign user data
    objectGroup.traverse(child => {
        if (child.isMesh) {
            if (isFurniture) {
                child.material = shared.furnitureMat.clone();
                child.userData.surfaceType = 'FURNITURE';
            } else if (isVegetation) {
                child.material = shared.vegetationCanopyMat.clone();
                child.userData.surfaceType = 'VEGETATION_CANOPY';
            }
            applyClippingToMaterial(child.material, renderer.clippingPlanes);
        }
    });

    objectGroup.userData = {
        isFurniture: isFurniture,
        isVegetation: isVegetation,
        assetType: assetType,
    };

    // Add to the correct container
    if (isFurniture) {
        furnitureContainer.add(objectGroup);
    } else if (isVegetation) {
        vegetationContainer.add(objectGroup);
    }

    return objectGroup;
}

// --- START: Added getWallGroupById Function ---
/**
 * Finds and returns a wall group object based on its canonical ID.
 * @param {string} id - The canonical ID ('n', 's', 'e', 'w').
 * @returns {THREE.Group | null} The found wall group or null.
 */
export function getWallGroupById(id) {
    // wallSelectionGroup contains one child: wallContainer. We search within wallContainer.
    const wallContainer = wallSelectionGroup.children[0];
    if (!wallContainer) {
        console.warn("Wall container not found in wallSelectionGroup.");
        return null;
    }
    // Find the specific wall segment group within the container
    return wallContainer.children.find(group => group.userData.canonicalId === id) || null;
}
