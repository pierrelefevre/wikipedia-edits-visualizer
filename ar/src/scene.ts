import { createPlaneMarker } from "./objects/PlaneMarker";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { handleXRHitTest } from "./utils/hitTest";
import * as THREE from "three";
import * as CANNON from "cannon";

import {
  AmbientLight,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  XRFrame,
} from "three";

const url = "https://wikipedia-api.app.cloud.cbh.kth.se/v1/events";
const eventSource = new EventSource(url);

eventSource.onopen = () => {
  console.info("Opened connection.");
};
eventSource.onerror = (event) => {
  console.error("Encountered error", event);
};

let startingCoordinates: THREE.Matrix4 | null = null;

// cannon.js variables
let world: any;
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

export function createScene(renderer: WebGLRenderer) {
  const scene = new Scene();

  const camera = new PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.02,
    20
  );

  /**
   * Add some simple ambient lights to illuminate the model.
   */
  const ambientLight = new AmbientLight(0xffffff, 1.0);
  scene.add(ambientLight);

  /**
   * Create the plane marker to show on tracked surfaces.
   */
  const planeMarker: Mesh = createPlaneMarker();
  scene.add(planeMarker);

  /**
   * Setup the controller to get input from the XR space.
   */
  const controller = renderer.xr.getController(0);
  scene.add(controller);

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

  function shoot(event: any) {
    let maxSize = 4000;

    let diff = event.editSize;
    const maxRadius = 1000;
    maxSize = Math.max(maxSize, Math.abs(diff));

    // Radius should be proportional to the length of the edit compared to maxSize, capped at 5
    let radius = Math.min(maxRadius, Math.abs(diff)) / 5000;

    const ballShape = new CANNON.Sphere(radius);
    const ballGeometry = new THREE.SphereBufferGeometry(radius, 32, 32);

    const ballBody = new CANNON.Body({ mass: 1 });
    ballBody.addShape(ballShape);

    let color = "ffffff";
    if (diff < 0) {
      color = "ff0000";
    } else {
      color = "00ff00";
    }

    const ballMesh = new THREE.Mesh(
      ballGeometry,
      new THREE.MeshPhysicalMaterial({
        color: "#" + color,
        roughness: 0.5,
        metalness: 0.5,
        reflectivity: 0.7,
        clearcoat: 0.7,
        clearcoatRoughness: 0.5,
      })
    );

    ballMesh.visible = true;
    ballMesh.castShadow = true;
    ballMesh.receiveShadow = true;

    world.addBody(ballBody);
    scene.add(ballMesh);
    balls.push(ballBody);
    ballMeshes.push(ballMesh);

    // Clone matrix and raise height
    if (!startingCoordinates) {
      startingCoordinates = planeMarker.matrix.clone();
      startingCoordinates.makeTranslation(0, 0.5, 0);
    }

    let positionFromMatrix: THREE.Vector3 =
      new THREE.Vector3().setFromMatrixPosition(startingCoordinates);

    ballBody.position.set(
      positionFromMatrix.x,
      positionFromMatrix.y,
      positionFromMatrix.z
    );

    ballMesh.position.set(
      ballBody.position.x,
      ballBody.position.y,
      ballBody.position.z
    );
  }

  eventSource.onmessage = (event) => {
    if (!planeMarker.visible) return;

    // event.data will be a JSON message
    const data = JSON.parse(event.data);
    // Edits from English Wikipedia
    shoot(data);
  };

  /**
   * Called whenever a new hit test result is ready.
   */
  function onHitTestResultReady(hitPoseTransformed: Float32Array) {
    if (hitPoseTransformed) {
      planeMarker.visible = true;
      planeMarker.matrix.fromArray(hitPoseTransformed);
    }
  }

  /**
   * Called whenever the hit test is empty/unsuccesful.
   */
  function onHitTestResultEmpty() {
    planeMarker.visible = false;
  }

  /**
   * The main render loop.
   *
   * This is where we perform hit-tests and update the scene
   * whenever anything changes.
   */
  const renderLoop = (timestamp: any, frame?: XRFrame) => {
    if (renderer.xr.isPresenting) {
      if (frame) {
        handleXRHitTest(
          renderer,
          frame,
          onHitTestResultReady,
          onHitTestResultEmpty
        );
      }

      world.step(timeStep, 1 / 30);
      // // Shrink balls
      // for (let i = 0; i < balls.length; i++) {
      //   if (balls[i].shapes[0].radius < 0.05) {
      //     ballMeshes[i].geometry.dispose();
      //     ballMeshes[i].material.dispose();
      //     scene.remove(ballMeshes[i]);
      //     world.removeBody(balls[i]);
      //     balls.splice(i, 1);
      //     ballMeshes.splice(i, 1);
      //     continue;
      //   }

      //   let factor = 0.001;
      //   if (balls[i].shapes[0].radius < 0.5) {
      //     factor = 0.01;
      //   }

      //   // Adjust physics radius
      //   balls[i].shapes[0].radius = balls[i].shapes[0].radius * (1 - factor);

      //   // Adjust three.js radius
      //   let currentScale = new THREE.Vector3();
      //   ballMeshes[i].getWorldScale(currentScale);
      //   ballMeshes[i].scale.set(
      //     currentScale.x * (1 - factor),
      //     currentScale.y * (1 - factor),
      //     currentScale.z * (1 - factor)
      //   );
      // }

      // Update ball positions
      for (let i = 0; i < balls.length; i++) {
        ballMeshes[i].position.copy(balls[i].position);
        ballMeshes[i].quaternion.copy(balls[i].quaternion);
      }

      renderer.render(scene, camera);
    }
  };

  renderer.setAnimationLoop(renderLoop);
}
