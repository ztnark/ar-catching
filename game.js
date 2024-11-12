import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

let camera, scene, renderer, video;
let videoTexture, videoMaterial;
let balls = [];
let score = 0;
let particles = [];
const PARTICLE_COUNT = 20;
let controller1, controller2;
let hand1, hand2;
let xrSession = null;

// Initialize Three.js scene
function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // Set up WebXR-compatible renderer
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Add AR button
    document.body.appendChild(ARButton.createButton(renderer, {
        requiredFeatures: ['hit-test']
    }));

    // Set up controllers
    controller1 = renderer.xr.getController(0);
    controller2 = renderer.xr.getController(1);
    scene.add(controller1);
    scene.add(controller2);

    // Set up hand tracking if supported
    try {
        hand1 = renderer.xr.getHand(0);
        hand2 = renderer.xr.getHand(1);
        
        if (hand1 && hand2) {
            scene.add(hand1);
            scene.add(hand2);

            // Initialize hand models
            const handModelFactory = new XRHandModelFactory();
            
            // Add models to hands
            hand1.add(handModelFactory.createHandModel(hand1, 'spheres'));
            hand2.add(handModelFactory.createHandModel(hand2, 'spheres'));
            
            console.log('Hand tracking initialized');
        } else {
            console.log('Hand tracking not available on this device');
        }
    } catch (error) {
        console.log('Error initializing hand tracking:', error);
    }

    // Add lights
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    scene.add(light);

    camera.position.z = 3;
}

// Create a new ball
function createBall() {
    const geometry = new THREE.SphereGeometry(0.05, 32, 32);
    const material = new THREE.MeshPhongMaterial({ 
        color: Math.random() * 0xffffff,
        opacity: 0.8,
        transparent: true
    });
    const ball = new THREE.Mesh(geometry, material);
    
    // Get camera position and direction for spawning
    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);
    
    // Spawn balls in front of where camera is looking
    ball.position.set(
        cameraPosition.x + (Math.random() - 0.5),
        cameraPosition.y + (Math.random() - 0.5),
        cameraPosition.z - 2
    );
    
    // Adjust velocity to move towards player
    const direction = new THREE.Vector3();
    direction.subVectors(cameraPosition, ball.position).normalize();
    ball.velocity = direction.multiplyScalar(0.05);
    
    scene.add(ball);
    balls.push(ball);
}

// Check for controller collision with balls
function checkControllerCollisions() {
    const controllers = [controller1, controller2];
    
    // Check controller collisions
    controllers.forEach(controller => {
        if (!controller.userData.collider) {
            controller.userData.collider = new THREE.Sphere(new THREE.Vector3(), 0.1);
        }
        
        controller.userData.collider.center.setFromMatrixPosition(controller.matrixWorld);
        
        checkBallCollisions(controller.userData.collider);
    });

    // Check hand collisions only if hands are defined and have joints
    if (hand1 && hand2) {
        [hand1, hand2].forEach(hand => {
            if (hand && hand.joints && hand.joints['index-finger-tip']) {
                if (!hand.userData.collider) {
                    hand.userData.collider = new THREE.Sphere(new THREE.Vector3(), 0.05);
                }
                
                hand.userData.collider.center.setFromMatrixPosition(hand.joints['index-finger-tip'].matrixWorld);
                
                checkBallCollisions(hand.userData.collider);
            }
        });
    }
}

// Helper function to check ball collisions
function checkBallCollisions(collider) {
    balls.forEach((ball, index) => {
        const distance = collider.center.distanceTo(ball.position);
        if (distance < collider.radius + 0.05) { // Collision threshold
            score += 10;
            document.getElementById('score').textContent = `Score: ${score}`;
            createExplosion(ball.position.clone(), ball.material.color);
            scene.remove(ball);
            balls.splice(index, 1);
        }
    });
}

// Modified animation loop for WebXR
function animate() {
    renderer.setAnimationLoop((timestamp, frame) => {
        if (frame) {
            const referenceSpace = renderer.xr.getReferenceSpace();
            const session = renderer.xr.getSession();

            // Only spawn balls when in AR session
            if (session && Math.random() < 0.02) {
                createBall();
            }
        }
        
        updateBalls();
        updateParticles(1/60);
        checkControllerCollisions();
        
        renderer.render(scene, camera);
    });
}

// Initialize and start the game
init();
animate();

// Create explosion particles
function createExplosion(position, color) {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const geometry = new THREE.SphereGeometry(0.01, 8, 8);
        const material = new THREE.MeshPhongMaterial({ 
            color: color,
            emissive: color,
            emissiveIntensity: 0.5
        });
        const particle = new THREE.Mesh(geometry, material);
        
        // Set particle position to ball's position
        particle.position.copy(position);
        
        // Random velocity in all directions
        const speed = 0.1;
        particle.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * speed,
            (Math.random() - 0.5) * speed,
            (Math.random() - 0.5) * speed
        );
        
        // Add lifetime and fade properties
        particle.lifetime = 1.0; // seconds
        particle.life = particle.lifetime;
        
        scene.add(particle);
        particles.push(particle);
    }
}

// Update particles
function updateParticles(deltaTime) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        
        // Update position
        particle.position.add(particle.velocity);
        
        // Update lifetime
        particle.life -= deltaTime;
        
        // Scale and fade
        const scale = particle.life / particle.lifetime;
        particle.scale.set(scale, scale, scale);
        particle.material.opacity = scale;
        
        // Remove dead particles
        if (particle.life <= 0) {
            scene.remove(particle);
            particles.splice(i, 1);
        }
    }
}

// Update ball positions and check collisions
function updateBalls() {
    for (let i = balls.length - 1; i >= 0; i--) {
        const ball = balls[i];
        ball.position.add(ball.velocity);

        // Remove balls that go too far
        if (ball.position.z > 2) {
            scene.remove(ball);
            balls.splice(i, 1);
        }
    }
}

// Handle window resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}); 