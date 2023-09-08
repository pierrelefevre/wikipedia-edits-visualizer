import * as CANNON from "./cannon-es.js";
import * as THREE from "./three.js";
import Stats from "./stats.js";
import { PointerLockControlsCannon } from "./PointerLockControlsCannon.js";

const url = "https://stream.wikimedia.org/v2/stream/recentchange";
const eventSource = new EventSource(url);

eventSource.onopen = () => {
  console.info("Opened connection.");
};
eventSource.onerror = (event) => {
  console.error("Encountered error", event);
};
/**
 * Example of a really barebones version of a fps game.
 */

// three.js variables
let camera, scene, renderer, stats;
let material;

// cannon.js variables
let world;
let controls;
const timeStep = 1 / 60;
let lastCallTime = performance.now();
let sphereShape;
let sphereBody;
let physicsMaterial;
const balls = [];
const ballMeshes = [];
const boxes = [];
const boxMeshes = [];

// simulation variables
let maxSize = 4000;
let simulationStarted = false;

const instructions = document.getElementById("instructions");

initThree();
initCannon();
initPointerLock();
animate();

function initThree() {
  // Camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 0, 500);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(scene.fog.color);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  document.body.appendChild(renderer.domElement);

  // Stats.js
  stats = new Stats();
  document.body.appendChild(stats.dom);

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambientLight);

  const spotlight = new THREE.SpotLight(0xffffff, 0.9, 0, Math.PI / 4, 1);
  spotlight.position.set(10, 125, 20);
  spotlight.target.position.set(0, 0, 0);

  spotlight.castShadow = true;

  spotlight.shadow.camera.near = 10;
  spotlight.shadow.camera.far = 100;
  spotlight.shadow.camera.fov = 30;

  // spotlight.shadow.bias = -0.0001
  spotlight.shadow.mapSize.width = 2048;
  spotlight.shadow.mapSize.height = 2048;

  scene.add(spotlight);

  // Generic material
  material = new THREE.MeshLambertMaterial({ color: 0xdddddd });

  // Floor
  const floorGeometry = new THREE.PlaneBufferGeometry(300, 300, 100, 100);
  floorGeometry.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeometry, material);
  floor.receiveShadow = true;
  scene.add(floor);

  window.addEventListener("resize", onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function initCannon() {
  world = new CANNON.World();

  // Tweak contact properties.
  // Contact stiffness - use to make softer/harder contacts
  world.defaultContactMaterial.contactEquationStiffness = 1e9;

  // Stabilization time in number of timesteps
  world.defaultContactMaterial.contactEquationRelaxation = 4;

  const solver = new CANNON.GSSolver();
  solver.iterations = 7;
  solver.tolerance = 0.1;
  world.solver = new CANNON.SplitSolver(solver);
  // use this to test non-split solver
  // world.solver = solver

  world.gravity.set(0, -20, 0);

  // Create a slippery material (friction coefficient = 0.0)
  physicsMaterial = new CANNON.Material("physics");
  const physics_physics = new CANNON.ContactMaterial(
    physicsMaterial,
    physicsMaterial,
    {
      friction: 0.0,
      restitution: 0.3,
    }
  );

  // We must add the contact materials to the world
  world.addContactMaterial(physics_physics);

  // Create the user collision sphere
  const radius = 1.3;
  sphereShape = new CANNON.Sphere(radius);
  sphereBody = new CANNON.Body({ mass: 5, material: physicsMaterial });
  sphereBody.addShape(sphereShape);
  sphereBody.position.set(0, 1.3, 35);
  sphereBody.linearDamping = 0.9;
  world.addBody(sphereBody);

  // Create the ground plane
  const groundShape = new CANNON.Plane();
  const groundBody = new CANNON.Body({ mass: 0, material: physicsMaterial });
  groundBody.addShape(groundShape);
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  // Add perimeter box
  let wallHeight = 200;
  let wallThickness = 0.1;
  let innerSize = 20;
  const boxSizes = [
    [innerSize, wallThickness],
    [wallThickness, innerSize],
    [innerSize, wallThickness],
    [wallThickness, innerSize],
  ];
  const boxPositions = [
    [0, -(innerSize + wallThickness)],
    [innerSize, 0],
    [0, innerSize + wallThickness],
    [-innerSize, 0],
  ];

  for (let i = 0; i < 4; i++) {
    // Add boxes both in cannon.js and three.js
    const halfExtents = new CANNON.Vec3(
      boxSizes[i][0],
      wallHeight,
      boxSizes[i][1]
    );
    const boxShape = new CANNON.Box(halfExtents);
    const boxGeometry = new THREE.BoxBufferGeometry(
      halfExtents.x * 2,
      halfExtents.y * 2,
      halfExtents.z * 2
    );

    const boxBody = new CANNON.Body({ fixedRotation: true });
    boxBody.addShape(boxShape);
    // const boxMesh = new THREE.Mesh(boxGeometry)
    const boxMesh = new THREE.Mesh(boxGeometry, "transparent");

    boxBody.position.set(boxPositions[i][0], wallHeight, boxPositions[i][1]);
    boxMesh.position.copy(boxBody.position);
    boxMesh.castShadow = true;
    boxMesh.receiveShadow = true;

    world.addBody(boxBody);
    scene.add(boxMesh);
    boxes.push(boxBody);
    boxMeshes.push(boxMesh);
  }

  function shoot(event) {
    //   {
    //     "$schema": "/mediawiki/recentchange/1.0.0",
    //     "meta": {
    //         "uri": "https://en.wikipedia.org/wiki/Category:Category-Class_politics_articles",
    //         "request_id": "be43873f-8ef3-4f36-ba88-22fb27fd7793",
    //         "id": "814177ae-4cf6-4f22-91f3-cf2dfc0e6622",
    //         "dt": "2023-09-08T18:34:43Z",
    //         "domain": "en.wikipedia.org",
    //         "stream": "mediawiki.recentchange",
    //         "topic": "eqiad.mediawiki.recentchange",
    //         "partition": 0,
    //         "offset": 4928880314
    //     },
    //     "id": 1673247079,
    //     "type": "categorize",
    //     "namespace": 14,
    //     "title": "Category:Category-Class politics articles",
    //     "title_url": "https://en.wikipedia.org/wiki/Category:Category-Class_politics_articles",
    //     "comment": "[[:Category talk:Left-wing politicians in France]] added to category, [[Special:WhatLinksHere/Category talk:Left-wing politicians in France|this page is included within other pages]]",
    //     "timestamp": 1694198083,
    //     "user": "Simeon",
    //     "bot": false,
    //     "notify_url": "https://en.wikipedia.org/w/index.php?diff=1174483612&oldid=404589625",
    //     "server_url": "https://en.wikipedia.org",
    //     "server_name": "en.wikipedia.org",
    //     "server_script_path": "/w",
    //     "wiki": "enwiki",
    //     "parsedcomment": "<a href=\"/wiki/Category_talk:Left-wing_politicians_in_France\" title=\"Category talk:Left-wing politicians in France\">Category talk:Left-wing politicians in France</a> added to category, <a href=\"/wiki/Special:WhatLinksHere/Category_talk:Left-wing_politicians_in_France\" title=\"Special:WhatLinksHere/Category talk:Left-wing politicians in France\">this page is included within other pages</a>"
    // }
    // Validate event
    if (!(event.length && event.length.old && event.length.new)) return;

    let diff = event.length.new - event.length.old;
    const maxRadius = 1000;
    maxSize = Math.max(maxSize, Math.abs(diff));

    // Radius should be proportional to the length of the edit compared to maxSize, capped at 5
    let radius = Math.min(maxRadius, Math.abs(diff)) / 100;

    console.log(radius, maxSize, diff);
    
    const ballShape = new CANNON.Sphere(radius);
    const ballGeometry = new THREE.SphereBufferGeometry(radius, 32, 32);

    const ballBody = new CANNON.Body({ mass: 1 });
    ballBody.addShape(ballShape);

    // Generate random hex color
    let color = "ffffff";
    // let color = Math.floor(Math.random() * 16777215).toString(16);
    // while (color.length < 6) {
    //   color = "0" + color;
    // }

    if (diff < 0) {
      color = "ff0000";
    } else {
      color = "00ff00";
    }

    const ballMesh = new THREE.Mesh(
      ballGeometry,
      new THREE.MeshPhysicalMaterial({
        color: "#" + color,
        roughness: Math.random(),
        metalness: Math.random(),
        reflectivity: Math.random(),
        clearcoat: Math.random(),
        clearcoatRoughness: Math.random(),
      })
    );

    ballMesh.castShadow = true;
    ballMesh.receiveShadow = true;

    world.addBody(ballBody);
    scene.add(ballMesh);
    balls.push(ballBody);
    ballMeshes.push(ballMesh);

    // set ballBody.velocity to fire downwards
    ballBody.velocity.set(Math.random() * 2 - 1, -10, Math.random() * 2 - 1);

    ballBody.position.set(0, 50, 0);
    ballMesh.position.copy(ballBody.position);
  }

  eventSource.onmessage = (event) => {
    if (!simulationStarted) return;

    // event.data will be a JSON message
    const data = JSON.parse(event.data);
    // Edits from English Wikipedia
    if (data.server_name === "en.wikipedia.org") {
      // Output the title of the edited page
      shoot(data);
    }
  };

  window.addEventListener("click", () => {});
}

function initPointerLock() {
  controls = new PointerLockControlsCannon(camera, sphereBody);
  scene.add(controls.getObject());

  instructions.addEventListener("click", () => {
    controls.lock();
    simulationStarted = true;
  });

  controls.addEventListener("lock", () => {
    controls.enabled = true;
    instructions.style.display = "none";
  });

  controls.addEventListener("unlock", () => {
    controls.enabled = false;
    instructions.style.display = null;
  });
}

function animate() {
  requestAnimationFrame(animate);

  const time = performance.now() / 1000;
  const dt = time - lastCallTime;
  lastCallTime = time;

  // if (controls.enabled) {
  world.step(timeStep, dt);

  // Shrink balls
  for (let i = 0; i < balls.length; i++) {
    if (balls[i].shapes[0].radius < 0.05) {
      ballMeshes[i].geometry.dispose();
      ballMeshes[i].material.dispose();
      scene.remove(ballMeshes[i]);
      world.removeBody(balls[i]);
      balls.splice(i, 1);
      ballMeshes.splice(i, 1);
      continue;
    }

    let factor = 0.001;
    if (balls[i].shapes[0].radius < 0.5) {
      factor = 0.01;
    }

    // Adjust physics radius
    balls[i].shapes[0].radius = balls[i].shapes[0].radius * (1 - factor);

    // Adjust three.js radius
    let currentScale = new THREE.Vector3();
    ballMeshes[i].getWorldScale(currentScale);
    ballMeshes[i].scale.set(
      currentScale.x * (1 - factor),
      currentScale.y * (1 - factor),
      currentScale.z * (1 - factor)
    );
  }

  // Update ball positions
  for (let i = 0; i < balls.length; i++) {
    ballMeshes[i].position.copy(balls[i].position);
    ballMeshes[i].quaternion.copy(balls[i].quaternion);
  }

  // Update box positions
  for (let i = 0; i < boxes.length; i++) {
    boxMeshes[i].position.copy(boxes[i].position);
    boxMeshes[i].quaternion.copy(boxes[i].quaternion);
  }
  // }

  controls.update(dt);
  renderer.render(scene, camera);
  stats.update();
}
