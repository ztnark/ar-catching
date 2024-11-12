let camera, scene, renderer, video;
let videoTexture, videoMaterial;
let balls = [];
let hands = [];
let score = 0;
const scoreElement = document.getElementById('score');
let particles = [];
const PARTICLE_COUNT = 20; // Particles per explosion

// Initialize Three.js scene
function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 1, 0);
    scene.add(directionalLight);

    camera.position.z = 3;

    // Initialize camera after scene setup
    initializeCamera();
}

// Modified video and camera initialization
function initializeCamera() {
    video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play();

                // Create video texture
                videoTexture = new THREE.VideoTexture(video);
                videoTexture.minFilter = THREE.LinearFilter;
                videoTexture.magFilter = THREE.LinearFilter;
                videoTexture.format = THREE.RGBFormat;

                // Calculate video plane size to cover full screen
                const distance = Math.abs(camera.position.z - (-3)); // Distance from camera to video plane
                const vFov = camera.fov * Math.PI / 180; // Convert vertical fov to radians
                const height = 2 * Math.tan(vFov / 2) * distance; // Visible height
                const width = height * (window.innerWidth / window.innerHeight); // Visible width

                // Create a plane to display the video
                const planeGeometry = new THREE.PlaneGeometry(width, height);
                videoMaterial = new THREE.MeshBasicMaterial({ 
                    map: videoTexture,
                    side: THREE.DoubleSide
                });
                const videoPlane = new THREE.Mesh(planeGeometry, videoMaterial);
                videoPlane.position.z = -3;
                scene.add(videoPlane);

                // Initialize camera utils after video is ready
                const camera_utils = new Camera(video, {
                    onFrame: async () => {
                        await handsDetection.send({image: video});
                    },
                    width: 1280,
                    height: 720
                });
                camera_utils.start();
            };
        })
        .catch(err => {
            console.error("Error accessing webcam:", err);
        });
}

// Create a new ball
function createBall() {
    const geometry = new THREE.SphereGeometry(0.05, 32, 32);
    const material = new THREE.MeshPhongMaterial({ color: Math.random() * 0xffffff });
    const ball = new THREE.Mesh(geometry, material);
    
    // Random position at the far end
    ball.position.x = (Math.random() - 0.5) * 2;
    ball.position.y = (Math.random() - 0.5) * 2;
    ball.position.z = -2;
    
    // Random velocity towards the camera
    ball.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.05,
        0.05
    );
    
    scene.add(ball);
    balls.push(ball);
}

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

        // Check for hand collision
        if (hands.length > 0) {
            hands.forEach(hand => {
                hand.forEach(point => {
                    const distance = ball.position.distanceTo(new THREE.Vector3(
                        (point.x - 0.5) * 2,
                        -(point.y - 0.5) * 2,
                        0
                    ));
                    
                    if (distance < 0.1) {
                        score += 10;
                        scoreElement.textContent = `Score: ${score}`;
                        // Create explosion before removing the ball
                        createExplosion(ball.position.clone(), ball.material.color);
                        scene.remove(ball);
                        balls.splice(i, 1);
                    }
                });
            });
        }

        // Remove balls that go too far
        if (ball.position.z > 2) {
            scene.remove(ball);
            balls.splice(i, 1);
        }
    }
}

// Set up hand tracking
const handsDetection = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});

handsDetection.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

handsDetection.onResults(results => {
    hands = results.multiHandLandmarks || [];
});

// Animation loop
let lastTime = 0;
function animate(currentTime) {
    requestAnimationFrame(animate);
    
    // Calculate delta time for smooth animations
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    // Update video texture if it exists
    if (videoTexture) {
        videoTexture.needsUpdate = true;
    }
    
    // Spawn new balls randomly
    if (Math.random() < 0.02) {
        createBall();
    }
    
    updateBalls();
    updateParticles(deltaTime);
    renderer.render(scene, camera);
}

// Initialize and start the game
init();
animate();

// Handle window resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Update video plane size if it exists
    if (scene.children.length > 0) {
        const videoPlane = scene.children.find(child => child.geometry instanceof THREE.PlaneGeometry);
        if (videoPlane) {
            const distance = Math.abs(camera.position.z - (-3));
            const vFov = camera.fov * Math.PI / 180;
            const height = 2 * Math.tan(vFov / 2) * distance;
            const width = height * (window.innerWidth / window.innerHeight);
            
            videoPlane.geometry = new THREE.PlaneGeometry(width, height);
        }
    }
}); 