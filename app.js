const canvas = document.getElementById("gameCanvas");
const menuPanel = document.getElementById("menuPanel");
const liveHud = document.getElementById("liveHud");
const practiceButton = document.getElementById("practiceButton");
const connectButton = document.getElementById("connectButton");
const playerNameInput = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCode");
const serverUrlInput = document.getElementById("serverUrl");
const connectionStatus = document.getElementById("connectionStatus");
const roomStatus = document.getElementById("roomStatus");
const hpValue = document.getElementById("hpValue");
const ammoValue = document.getElementById("ammoValue");
const scoreValue = document.getElementById("scoreValue");
const rosterList = document.getElementById("rosterList");

const DUMMY_SPAWNS = [
    new BABYLON.Vector3(12, 0, 4),
    new BABYLON.Vector3(-12, 0, 8),
    new BABYLON.Vector3(15, 0, -16),
    new BABYLON.Vector3(-8, 0, -18)
];

const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.01, 0.03, 0.06, 1);
scene.collisionsEnabled = true;
scene.gravity = new BABYLON.Vector3(0, -0.42, 0);
scene.fogMode = BABYLON.Scene.FOGMODE_EXP;
scene.fogDensity = 0.012;
scene.fogColor = new BABYLON.Color3(0.03, 0.07, 0.11);

const gameState = {
    online: false,
    playerId: null,
    roomCode: roomCodeInput.value.trim(),
    score: 0,
    health: 100,
    ammoInMagazine: 24,
    reserveAmmo: 96,
    isReloading: false,
    canShootAt: 0,
    lastNetworkSend: 0,
    networkInterval: 60,
    move: { forward: 0, right: 0, jump: false, sprint: false },
    websocket: null,
    remotePlayers: new Map(),
    dummyTargets: [],
    spawnPoints: [
        new BABYLON.Vector3(0, 2, -12),
        new BABYLON.Vector3(10, 2, 12),
        new BABYLON.Vector3(-12, 2, 10),
        new BABYLON.Vector3(8, 2, -6)
    ]
};

const light = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0.2, 1, 0.1), scene);
light.intensity = 0.8;

const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.3, -1, 0.4), scene);
sun.position = new BABYLON.Vector3(18, 30, -12);
sun.intensity = 1.15;

const camera = new BABYLON.UniversalCamera("camera", new BABYLON.Vector3(0, 2.5, -12), scene);
camera.attachControl(canvas, true);
camera.speed = 0;
camera.inertia = 0;
camera.angularSensibility = 3000;
camera.minZ = 0.1;
camera.applyGravity = true;
camera.checkCollisions = true;
camera.ellipsoid = new BABYLON.Vector3(0.6, 0.9, 0.6);
camera.keysUp = [];
camera.keysDown = [];
camera.keysLeft = [];
camera.keysRight = [];

const weaponAnchor = new BABYLON.TransformNode("weaponAnchor", scene);
weaponAnchor.parent = camera;
weaponAnchor.position = new BABYLON.Vector3(0.55, -0.45, 1.25);

const weaponBody = BABYLON.MeshBuilder.CreateBox("weaponBody", { width: 0.25, height: 0.2, depth: 0.75 }, scene);
weaponBody.parent = weaponAnchor;
weaponBody.position = new BABYLON.Vector3(0, 0, 0);

const muzzle = BABYLON.MeshBuilder.CreateCylinder("muzzle", { diameter: 0.08, height: 0.24 }, scene);
muzzle.parent = weaponAnchor;
muzzle.rotation.x = Math.PI / 2;
muzzle.position = new BABYLON.Vector3(0.02, 0.02, 0.45);

const neonMaterial = new BABYLON.StandardMaterial("neon", scene);
neonMaterial.diffuseColor = new BABYLON.Color3(0.08, 0.21, 0.26);
neonMaterial.emissiveColor = new BABYLON.Color3(0.15, 0.82, 0.85);
weaponBody.material = neonMaterial;

const muzzleMaterial = new BABYLON.StandardMaterial("muzzleMat", scene);
muzzleMaterial.diffuseColor = new BABYLON.Color3(0.28, 0.18, 0.09);
muzzle.material = muzzleMaterial;

function createEnvironment() {
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 80, height: 80 }, scene);
    const groundMat = new BABYLON.GridMaterial("groundMat", scene);
    groundMat.majorUnitFrequency = 8;
    groundMat.minorUnitVisibility = 0.38;
    groundMat.gridRatio = 2;
    groundMat.backFaceCulling = false;
    groundMat.mainColor = new BABYLON.Color3(0.03, 0.07, 0.09);
    groundMat.lineColor = new BABYLON.Color3(0.16, 0.41, 0.5);
    groundMat.opacity = 0.94;
    ground.material = groundMat;
    ground.checkCollisions = true;

    const wallPositions = [
        { position: new BABYLON.Vector3(0, 4, 40), scaling: new BABYLON.Vector3(80, 8, 2) },
        { position: new BABYLON.Vector3(0, 4, -40), scaling: new BABYLON.Vector3(80, 8, 2) },
        { position: new BABYLON.Vector3(40, 4, 0), scaling: new BABYLON.Vector3(2, 8, 80) },
        { position: new BABYLON.Vector3(-40, 4, 0), scaling: new BABYLON.Vector3(2, 8, 80) },
        { position: new BABYLON.Vector3(0, 2, 8), scaling: new BABYLON.Vector3(18, 4, 2) },
        { position: new BABYLON.Vector3(12, 2, -10), scaling: new BABYLON.Vector3(2, 4, 18) },
        { position: new BABYLON.Vector3(-15, 2, -4), scaling: new BABYLON.Vector3(12, 4, 2) }
    ];

    wallPositions.forEach((entry, index) => {
        const wall = BABYLON.MeshBuilder.CreateBox(`wall-${index}`, {}, scene);
        wall.position = entry.position;
        wall.scaling = entry.scaling;
        wall.checkCollisions = true;
        const wallMat = new BABYLON.StandardMaterial(`wallMat-${index}`, scene);
        wallMat.diffuseColor = new BABYLON.Color3(0.07, 0.12, 0.16);
        wallMat.emissiveColor = new BABYLON.Color3(0.02, 0.06, 0.08);
        wall.material = wallMat;
    });

    for (let index = 0; index < 12; index += 1) {
        const crate = BABYLON.MeshBuilder.CreateBox(`crate-${index}`, { size: 2.5 }, scene);
        crate.position = new BABYLON.Vector3(-20 + (index % 4) * 10, 1.25, -18 + Math.floor(index / 4) * 12);
        crate.rotation.y = Math.PI * 0.25 * (index % 3);
        crate.checkCollisions = true;
        const crateMat = new BABYLON.StandardMaterial(`crateMat-${index}`, scene);
        crateMat.diffuseColor = new BABYLON.Color3(0.18, 0.16, 0.14);
        crateMat.emissiveColor = new BABYLON.Color3(0.08, 0.05, 0.02);
        crate.material = crateMat;
    }
}

function createDummyTarget(position, index) {
    const root = new BABYLON.TransformNode(`dummy-${index}`, scene);
    root.position = position.clone();

    const body = BABYLON.MeshBuilder.CreateCylinder(`dummy-body-${index}`, { diameter: 1.1, height: 2.2 }, scene);
    body.parent = root;
    body.position.y = 1.1;

    const head = BABYLON.MeshBuilder.CreateSphere(`dummy-head-${index}`, { diameter: 0.72 }, scene);
    head.parent = root;
    head.position.y = 2.55;

    const material = new BABYLON.StandardMaterial(`dummy-mat-${index}`, scene);
    material.diffuseColor = new BABYLON.Color3(0.46, 0.14, 0.18);
    material.emissiveColor = new BABYLON.Color3(0.4, 0.1, 0.11);
    body.material = material;
    head.material = material;

    const healthBar = BABYLON.MeshBuilder.CreatePlane(`dummy-bar-${index}`, { width: 1.5, height: 0.18 }, scene);
    healthBar.parent = root;
    healthBar.position.y = 3.35;
    healthBar.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    const barMaterial = new BABYLON.StandardMaterial(`dummy-bar-mat-${index}`, scene);
    barMaterial.emissiveColor = new BABYLON.Color3(0.55, 1, 0.45);
    healthBar.material = barMaterial;

    const dummy = {
        root,
        body,
        head,
        healthBar,
        health: 100,
        maxHealth: 100,
        alive: true,
        respawnAt: 0
    };

    body.metadata = { type: "dummy", dummy };
    head.metadata = { type: "dummy", dummy };
    gameState.dummyTargets.push(dummy);
}

function populateDummies() {
    DUMMY_SPAWNS.forEach((spawn, index) => createDummyTarget(spawn, index));
}

function updateDummyTargets(now) {
    gameState.dummyTargets.forEach((dummy, index) => {
        if (!dummy.alive && now > dummy.respawnAt) {
            dummy.alive = true;
            dummy.health = dummy.maxHealth;
            dummy.root.setEnabled(true);
            dummy.root.position = DUMMY_SPAWNS[index].clone();
        }

        if (!dummy.alive) {
            return;
        }

        dummy.root.position.y = Math.sin(now * 0.0014 + index) * 0.18;
        dummy.root.rotation.y += 0.01;
        dummy.healthBar.scaling.x = Math.max(dummy.health / dummy.maxHealth, 0.05);
    });
}

function setMode({ online, roomCode, status }) {
    gameState.online = online;
    gameState.roomCode = roomCode;
    connectionStatus.textContent = status;
    roomStatus.textContent = `ROOM ${roomCode.toUpperCase()}`;
    liveHud.classList.add("active");
    menuPanel.style.display = "none";
}

function updateHud() {
    hpValue.textContent = String(gameState.health);
    ammoValue.textContent = `${gameState.ammoInMagazine} / ${gameState.reserveAmmo}`;
    scoreValue.textContent = String(gameState.score);

    const roster = [];
    roster.push(`<strong>${playerNameInput.value || "Player"}</strong> ${gameState.online ? "(YOU)" : "(PRACTICE)"}`);
    gameState.remotePlayers.forEach((remote) => {
        roster.push(`${remote.name} ${remote.team ? `[${remote.team}]` : ""}`);
    });
    rosterList.innerHTML = roster.join("<br>");
}

function applyMovement() {
    const direction = new BABYLON.Vector3.Zero();
    const forward = camera.getDirection(BABYLON.Axis.Z).scale(-1);
    const right = camera.getDirection(BABYLON.Axis.X);
    forward.y = 0;
    right.y = 0;
    forward.normalize();
    right.normalize();

    direction.addInPlace(forward.scale(gameState.move.forward));
    direction.addInPlace(right.scale(gameState.move.right));

    if (direction.lengthSquared() > 0) {
        direction.normalize();
    }

    const speed = gameState.move.sprint ? 0.28 : 0.18;
    camera.cameraDirection.addInPlace(direction.scale(speed));

    const grounded = Math.abs(camera.cameraDirection.y) < 0.0001;
    if (gameState.move.jump && grounded) {
        camera.cameraDirection.y = 0.22;
    }

    const bob = direction.lengthSquared() > 0 ? Math.sin(performance.now() * 0.014) * 0.02 : 0;
    weaponAnchor.position.x = 0.55 + bob;
    weaponAnchor.position.y = -0.45 + Math.abs(bob) * 0.5;
}

function requestPointerLock() {
    if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
    }
}

function flashWeapon() {
    neonMaterial.emissiveColor = new BABYLON.Color3(0.8, 0.95, 1);
    setTimeout(() => {
        neonMaterial.emissiveColor = new BABYLON.Color3(0.15, 0.82, 0.85);
    }, 70);
}

function registerHit(target, damage) {
    if (target.metadata?.type === "dummy") {
        const dummy = target.metadata.dummy;
        if (!dummy.alive) {
            return;
        }
        dummy.health = Math.max(dummy.health - damage, 0);
        if (dummy.health === 0) {
            dummy.alive = false;
            dummy.root.setEnabled(false);
            dummy.respawnAt = performance.now() + 2200;
            gameState.score += 100;
        } else {
            gameState.score += 15;
        }
        updateHud();
    }
}

function handleShoot() {
    const now = performance.now();
    if (gameState.isReloading || now < gameState.canShootAt) {
        return;
    }

    if (gameState.ammoInMagazine <= 0) {
        triggerReload();
        return;
    }

    gameState.ammoInMagazine -= 1;
    gameState.canShootAt = now + 140;
    flashWeapon();

    const pick = scene.pick(scene.getEngine().getRenderWidth() / 2, scene.getEngine().getRenderHeight() / 2);
    if (pick?.hit && pick.pickedMesh) {
        registerHit(pick.pickedMesh, pick.pickedMesh.name.includes("head") ? 100 : 34);
        if (gameState.online && gameState.websocket?.readyState === WebSocket.OPEN) {
            sendMessage({
                type: "shot",
                payload: {
                    point: pick.pickedPoint?.asArray() ?? null,
                    meshName: pick.pickedMesh.name
                }
            });
        }
    }

    updateHud();
}

function triggerReload() {
    if (gameState.isReloading || gameState.reserveAmmo <= 0 || gameState.ammoInMagazine === 24) {
        return;
    }

    gameState.isReloading = true;
    connectionStatus.textContent = gameState.online ? "ONLINE // RELOADING" : "OFFLINE // RELOADING";

    window.setTimeout(() => {
        const needed = 24 - gameState.ammoInMagazine;
        const loaded = Math.min(needed, gameState.reserveAmmo);
        gameState.ammoInMagazine += loaded;
        gameState.reserveAmmo -= loaded;
        gameState.isReloading = false;
        connectionStatus.textContent = gameState.online ? "ONLINE LIVE" : "OFFLINE PRACTICE";
        updateHud();
    }, 900);
}

function createRemotePlayer(id, payload) {
    const root = new BABYLON.TransformNode(`remote-${id}`, scene);
    const body = BABYLON.MeshBuilder.CreateCapsule(`remote-body-${id}`, { radius: 0.55, height: 2.4 }, scene);
    body.parent = root;
    body.position.y = 1.2;
    const bodyMat = new BABYLON.StandardMaterial(`remote-mat-${id}`, scene);
    bodyMat.diffuseColor = payload.team === "BRAVO" ? new BABYLON.Color3(1, 0.48, 0.28) : new BABYLON.Color3(0.18, 0.84, 1);
    bodyMat.emissiveColor = bodyMat.diffuseColor.scale(0.3);
    body.material = bodyMat;

    const plane = BABYLON.MeshBuilder.CreatePlane(`remote-tag-${id}`, { width: 2.6, height: 0.45 }, scene);
    plane.parent = root;
    plane.position.y = 3.25;
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    const texture = new BABYLON.DynamicTexture(`remote-name-${id}`, { width: 512, height: 128 }, scene, true);
    texture.hasAlpha = true;
    const material = new BABYLON.StandardMaterial(`remote-tag-mat-${id}`, scene);
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    material.opacityTexture = texture;
    plane.material = material;

    const context = texture.getContext();
    context.clearRect(0, 0, 512, 128);
    texture.drawText(payload.name, 36, 84, "bold 52px Space Grotesk", "white", "transparent", true);

    const remote = {
        id,
        name: payload.name,
        team: payload.team,
        root,
        body,
        position: BABYLON.Vector3.Zero(),
        targetPosition: BABYLON.Vector3.FromArray(payload.position),
        rotationY: payload.rotationY ?? 0,
        targetRotationY: payload.rotationY ?? 0
    };
    root.position = remote.targetPosition.clone();
    root.rotation.y = remote.rotationY;
    gameState.remotePlayers.set(id, remote);
    updateHud();
}

function removeRemotePlayer(id) {
    const remote = gameState.remotePlayers.get(id);
    if (!remote) {
        return;
    }
    remote.root.getChildMeshes().forEach((mesh) => mesh.dispose());
    remote.root.dispose();
    gameState.remotePlayers.delete(id);
    updateHud();
}

function syncRemotePlayers(snapshot) {
    const seen = new Set();
    snapshot.players.forEach((player) => {
        if (player.id === gameState.playerId) {
            return;
        }
        seen.add(player.id);
        if (!gameState.remotePlayers.has(player.id)) {
            createRemotePlayer(player.id, player);
        }
        const remote = gameState.remotePlayers.get(player.id);
        remote.name = player.name;
        remote.team = player.team;
        remote.targetPosition = BABYLON.Vector3.FromArray(player.position);
        remote.targetRotationY = player.rotationY ?? 0;
    });

    [...gameState.remotePlayers.keys()].forEach((id) => {
        if (!seen.has(id)) {
            removeRemotePlayer(id);
        }
    });
}

function updateRemoteInterpolation() {
    gameState.remotePlayers.forEach((remote) => {
        remote.root.position = BABYLON.Vector3.Lerp(remote.root.position, remote.targetPosition, 0.16);
        remote.root.rotation.y = BABYLON.Scalar.Lerp(remote.root.rotation.y, remote.targetRotationY, 0.18);
    });
}

function sendMessage(message) {
    if (gameState.websocket?.readyState !== WebSocket.OPEN) {
        return;
    }
    gameState.websocket.send(JSON.stringify(message));
}

function connectToServer() {
    const name = (playerNameInput.value.trim() || "Player").slice(0, 18);
    const roomCode = roomCodeInput.value.trim() || "arena-01";
    const serverUrl = serverUrlInput.value.trim();

    localStorage.setItem("neon-strike-name", name);
    localStorage.setItem("neon-strike-room", roomCode);
    localStorage.setItem("neon-strike-server", serverUrl);

    if (!serverUrl) {
        connectionStatus.textContent = "SERVER URL REQUIRED";
        return;
    }

    if (gameState.websocket) {
        gameState.websocket.close();
    }

    const socket = new WebSocket(serverUrl);
    gameState.websocket = socket;
    connectionStatus.textContent = "CONNECTING...";

    socket.addEventListener("open", () => {
        setMode({ online: true, roomCode, status: "ONLINE LIVE" });
        sendMessage({
            type: "join",
            payload: {
                name,
                roomCode,
                team: Math.random() > 0.5 ? "ALPHA" : "BRAVO"
            }
        });
    });

    socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);

        if (message.type === "welcome") {
            gameState.playerId = message.payload.playerId;
        }

        if (message.type === "snapshot") {
            syncRemotePlayers(message.payload);
        }

        if (message.type === "system") {
            connectionStatus.textContent = message.payload.text;
        }
    });

    socket.addEventListener("close", () => {
        connectionStatus.textContent = "OFFLINE PRACTICE";
        gameState.online = false;
        gameState.playerId = null;
        gameState.remotePlayers.forEach((_, id) => removeRemotePlayer(id));
        roomStatus.textContent = "ROOM SOLO";
    });

    socket.addEventListener("error", () => {
        connectionStatus.textContent = "CONNECTION FAILED";
    });
}

function transmitPlayerState(now) {
    if (!gameState.online || gameState.websocket?.readyState !== WebSocket.OPEN) {
        return;
    }

    if (now - gameState.lastNetworkSend < gameState.networkInterval) {
        return;
    }

    gameState.lastNetworkSend = now;
    sendMessage({
        type: "state",
        payload: {
            position: camera.position.asArray(),
            rotationY: camera.rotation.y,
            pitch: camera.rotation.x,
            health: gameState.health,
            score: gameState.score
        }
    });
}

window.addEventListener("keydown", (event) => {
    if (event.code === "KeyW") {
        gameState.move.forward = 1;
    }
    if (event.code === "KeyS") {
        gameState.move.forward = -1;
    }
    if (event.code === "KeyA") {
        gameState.move.right = -1;
    }
    if (event.code === "KeyD") {
        gameState.move.right = 1;
    }
    if (event.code === "ShiftLeft") {
        gameState.move.sprint = true;
    }
    if (event.code === "Space") {
        gameState.move.jump = true;
    }
    if (event.code === "KeyR") {
        triggerReload();
    }
});

window.addEventListener("keyup", (event) => {
    if (["KeyW", "KeyS"].includes(event.code)) {
        gameState.move.forward = 0;
    }
    if (["KeyA", "KeyD"].includes(event.code)) {
        gameState.move.right = 0;
    }
    if (event.code === "ShiftLeft") {
        gameState.move.sprint = false;
    }
    if (event.code === "Space") {
        gameState.move.jump = false;
    }
});

canvas.addEventListener("pointerdown", () => {
    requestPointerLock();
    if (document.pointerLockElement === canvas) {
        handleShoot();
    }
});

practiceButton.addEventListener("click", () => {
    localStorage.setItem("neon-strike-name", playerNameInput.value.trim() || "Player");
    setMode({ online: false, roomCode: roomCodeInput.value.trim() || "solo", status: "OFFLINE PRACTICE" });
    updateHud();
    requestPointerLock();
});

connectButton.addEventListener("click", () => {
    connectToServer();
    updateHud();
    requestPointerLock();
});

document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement !== canvas && liveHud.classList.contains("active")) {
        connectionStatus.textContent = gameState.online ? "ONLINE // PAUSED" : "OFFLINE // PAUSED";
    } else if (liveHud.classList.contains("active")) {
        connectionStatus.textContent = gameState.online ? "ONLINE LIVE" : "OFFLINE PRACTICE";
    }
});

function loadPreferences() {
    const savedName = localStorage.getItem("neon-strike-name");
    const savedRoom = localStorage.getItem("neon-strike-room");
    const savedServer = localStorage.getItem("neon-strike-server");

    if (savedName) {
        playerNameInput.value = savedName;
    }
    if (savedRoom) {
        roomCodeInput.value = savedRoom;
    }
    if (savedServer) {
        serverUrlInput.value = savedServer;
    }
}

createEnvironment();
populateDummies();
loadPreferences();
updateHud();

scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    if (!liveHud.classList.contains("active")) {
        return;
    }
    applyMovement();
    updateDummyTargets(now);
    updateRemoteInterpolation();
    transmitPlayerState(now);
});

engine.runRenderLoop(() => {
    scene.render();
});

window.addEventListener("resize", () => {
    engine.resize();
});