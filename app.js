const express = require('express');
const session = require('express-session');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');
const cors = require('cors');
const logger = require('./logger');
const app = express();
const port = 3000;

// Protected addons configuration
const LOCAL_ADDON = {
    manifest: {
        id: "org.stremio.local",
        version: "1.10.0",
        name: "Local Files (without catalog support)",
        description: "Local add-on to find playable files: .torrent, .mp4, .mkv and .avi",
        types: ["movie", "series", "other"],
        resources: [
            {
                name: "meta",
                types: ["other"],
                idPrefixes: ["local:", "bt:"]
            },
            {
                name: "stream",
                types: ["movie", "series"],
                idPrefixes: ["tt"]
            }
        ]
    },
    transportUrl: "http://127.0.0.1:11470/local-addon/manifest.json",
    flags: {
        official: true,
        protected: true
    }
};

const REMOTE_ADDON_URLS = [
    "https://v3-cinemeta.strem.io/manifest.json",
    "https://opensubtitles-v3.strem.io/manifest.json"
];

async function fetchProtectedAddons() {
    const protectedAddons = [LOCAL_ADDON];
    
    for (const url of REMOTE_ADDON_URLS) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                logger.error(`Failed to fetch manifest from ${url}: ${response.status}`);
                continue;
            }
            
            const manifest = await response.json();
            protectedAddons.push({
                manifest,
                transportUrl: url,
                flags: {
                    official: true,
                    protected: url.includes("cinemeta")
                }
            });
        } catch (error) {
            logger.error(`Error fetching manifest from ${url}:`, error);
        }
    }
    
    return protectedAddons;
}

let PROTECTED_ADDONS = [LOCAL_ADDON];
// Configuration
const config = {
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "password123",
    DB_PATH: path.join(__dirname, "database.json"),
    USERS_DB_PATH: path.join(__dirname, "users.json"),
    SESSION_SECRET: "bhdsaububsb387444nxkj"
};

// Stremio API endpoints
const STREMIO_API = {
    BASE_URL: "https://api.strem.io/api",
    LOGIN: "/login",
    REGISTER: "/register",
    ADDON_COLLECTION_GET: "/addonCollectionGet",
    ADDON_COLLECTION_SET: "/addonCollectionSet",
    LOGOUT: "/logout"
};

// Process error handlers
process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception:", error);
    process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// CORS Configuration
const corsOptions = {
    origin: "*",
    methods: ["GET", "POST", "DELETE", "PUT", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400
};

// Middleware
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "50mb" }));
app.use(express.static("public"));
app.use(session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Helper Functions
async function initializeDatabase() {
    try {
        await fs.access(config.DB_PATH);
        logger.info('Database exists');
    } catch {
        logger.info('Creating new database');
        await fs.writeFile(config.DB_PATH, JSON.stringify([]));
    }
}

async function initializeUsersDatabase() {
    try {
        await fs.access(config.USERS_DB_PATH);
        logger.info('Users database exists');
    } catch {
        logger.info('Creating new users database');
        await fs.writeFile(config.USERS_DB_PATH, JSON.stringify([]));
    }
}

async function readDatabase() {
    try {
        const data = await fs.readFile(config.DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.error('Error reading database:', error);
        throw error;
    }
}

async function readUsersDatabase() {
    try {
        const data = await fs.readFile(config.USERS_DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.error('Error reading users database:', error);
        throw error;
    }
}

async function writeDatabase(data) {
    try {
        await fs.writeFile(config.DB_PATH, JSON.stringify(data, null, 2));
        logger.debug('Database updated successfully', {
            entriesCount: data.length
        });
    } catch (error) {
        logger.error('Error writing to database:', error);
        throw error;
    }
}

async function writeUsersDatabase(data) {
    try {
        await fs.writeFile(config.USERS_DB_PATH, JSON.stringify(data, null, 2));
        logger.debug('Users database updated successfully', {
            entriesCount: data.length
        });
    } catch (error) {
        logger.error('Error writing to users database:', error);
        throw error;
    }
}
// Stremio API Helper Functions
async function stremioRequest(endpoint, body) {
    try {
        logger.debug(`Making Stremio API request to ${endpoint}`, { body });
        const response = await fetch(`${STREMIO_API.BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=UTF-8',
                'Accept': '*/*'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            logger.error(`Stremio API error: ${response.status}`, {
                endpoint,
                status: response.status,
                statusText: response.statusText
            });
            throw new Error(`Stremio API error: ${response.status}`);
        }

        const data = await response.json();
        logger.debug(`Stremio API response from ${endpoint}`, { data });
        return data;
    } catch (error) {
        logger.error(`Stremio API request failed: ${error.message}`, {
            endpoint,
            error: error.stack
        });
        throw error;
    }
}

// Helper function to validate manifest
function validateManifest(manifest) {
    try {
        const requiredFields = ['id', 'name', 'version'];
        for (const field of requiredFields) {
            if (!manifest[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
        logger.debug('Manifest validation successful', { manifest });
        return true;
    } catch (error) {
        logger.error('Manifest validation failed:', error);
        throw error;
    }
}

async function fetchManifest(url) {
    try {
        logger.debug(`Fetching manifest from ${url}`);
        const response = await fetch(url, {
            timeout: 10000,
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const manifest = await response.json();
        validateManifest(manifest);
        logger.info('Successfully fetched and validated manifest', {
            url,
            manifestId: manifest.id
        });
        return manifest;
    } catch (error) {
        logger.error(`Failed to fetch manifest from ${url}:`, error);
        throw new Error(`Failed to fetch manifest: ${error.message}`);
    }
}

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session.isAuthenticated) {
        logger.debug('Auth check passed', {
            path: req.path,
            method: req.method,
            ip: req.ip
        });
        next();
    } else {
        logger.warn('Unauthorized access attempt', {
            path: req.path,
            method: req.method,
            ip: req.ip
        });
        res.status(401).json({ error: 'Unauthorized' });
    }
};
// Basic routes
app.get('/api/auth/status', (req, res) => {
    logger.debug('Auth status check', {
        isAuthenticated: !!req.session.isAuthenticated,
        stremioConnected: !!req.session.stremioAuthKey,
        ip: req.ip
    });
    res.json({ 
        isAuthenticated: !!req.session.isAuthenticated,
        stremioConnected: !!req.session.stremioAuthKey,
        stremioUser: req.session.stremioUser || null
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    logger.debug('Login attempt', { username, ip: req.ip });

    if (username === config.ADMIN_USERNAME && password === config.ADMIN_PASSWORD) {
        req.session.isAuthenticated = true;
        logger.info('Successful admin login', { username, ip: req.ip });
        res.json({ success: true });
    } else {
        logger.warn('Failed login attempt', { username, ip: req.ip });
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.post('/api/logout', (req, res) => {
    logger.info('User logged out', { ip: req.ip });
    req.session.destroy();
    res.json({ success: true });
});

// Stremio Authentication Routes
app.post('/api/stremio/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        const response = await stremioRequest(STREMIO_API.REGISTER, {
            type: "Auth",
            type: "Register",
            email,
            password,
            gdpr: true,
            facebook: false
        });

        if (response.error) {
            return res.status(400).json({ error: response.error });
        }

        logger.info('User registered successfully with Stremio', { email });
        res.json({ success: true });
    } catch (error) {
        logger.error('Stremio registration error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/stremio/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const response = await stremioRequest(STREMIO_API.LOGIN, {
            type: "Auth",
            type: "Login",
            email,
            password,
            facebook: false
        });

        if (!response.result?.authKey) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        req.session.stremioAuthKey = response.result.authKey;
        req.session.stremioUser = { email };

        logger.info('User logged in successfully to Stremio', { email });
        res.json({ success: true });
    } catch (error) {
        logger.error('Stremio login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// User Management Routes
app.post('/api/users', requireAuth, async (req, res) => {
    try {
        const { email, password } = req.body;
        logger.debug('Adding new user', { email });

        const response = await stremioRequest(STREMIO_API.LOGIN, {
            type: "Auth",
            type: "Login",
            email,
            password,
            facebook: false
        });

        if (!response.result?.authKey) {
            logger.warn('Invalid Stremio credentials during user add', { email });
            return res.status(401).json({ error: 'Invalid Stremio credentials' });
        }

        const users = await readUsersDatabase();
        
        if (users.some(user => user.email === email)) {
            return res.status(400).json({ error: 'User already exists' });
        }

        users.push({
            email,
            password,
            lastSync: null
        });

        await writeUsersDatabase(users);
        logger.info('User added successfully', { email });
        res.json({ success: true });
    } catch (error) {
        logger.error('Error adding user:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/users', requireAuth, async (req, res) => {
    try {
        const users = await readUsersDatabase();
        res.json(users.map(user => ({
            email: user.email,
            lastSync: user.lastSync
        })));
    } catch (error) {
        logger.error('Error fetching users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/users/:email', requireAuth, async (req, res) => {
    try {
        const { email } = req.params;
        const users = await readUsersDatabase();
        const filteredUsers = users.filter(user => user.email !== email);
        
        if (filteredUsers.length === users.length) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        await writeUsersDatabase(filteredUsers);
        logger.info('User deleted successfully', { email });
        res.json({ success: true });
    } catch (error) {
        logger.error('Error deleting user:', error);
        res.status(500).json({ error: error.message });
    }
});
// User Sync Route
app.post('/api/users/:email/sync', requireAuth, async (req, res) => {
    try {
        const { email } = req.params;
        logger.debug('Starting user sync', { email });

        // Fetch fresh manifests first
        PROTECTED_ADDONS = await fetchProtectedAddons();

        const users = await readUsersDatabase();
        const user = users.find(u => u.email === email);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Login to Stremio
        const loginResponse = await stremioRequest(STREMIO_API.LOGIN, {
            type: "Auth",
            type: "Login",
            email: user.email,
            password: user.password,
            facebook: false
        });

        if (!loginResponse.result?.authKey) {
            return res.status(401).json({ error: 'Failed to authenticate with Stremio' });
        }

        const authKey = loginResponse.result.authKey;

        // Get local addons
        const localAddons = await readDatabase();

        // Format local addons
        const formattedLocalAddons = localAddons.map(addon => ({
            manifest: addon.manifest,
            transportUrl: addon.transportUrl,
            flags: {
                official: false,
                protected: false
            }
        }));

        // Combine with protected addons
        const allAddons = [...PROTECTED_ADDONS, ...formattedLocalAddons];

        // Prepare request in proper format
        const syncBody = {
            type: "AddonCollectionSet",
            authKey: authKey,
            addons: allAddons
        };

        // Sync to Stremio
        await stremioRequest(STREMIO_API.ADDON_COLLECTION_SET, syncBody);

        // Logout from Stremio
        await stremioRequest(STREMIO_API.LOGOUT, {
            type: "Logout",
            authKey
        });

        // Update last sync time
        user.lastSync = new Date().toISOString();
        await writeUsersDatabase(users);

        logger.info('User sync completed successfully', { email });
        res.json({ success: true });
    } catch (error) {
        logger.error('Error during user sync:', error);
        res.status(500).json({ error: error.message });
    }
});

// Addon routes
app.get('/manifest.json', (req, res) => {
    res.json({
        id: "community.stremio.addons-index",
        version: "1.0.0",
        name: "Stremio Addons Index",
        description: "Index of Stremio addons with user synchronization",
        types: ["movie", "series", "channel", "tv", "addon"],
        catalogs: [{
            type: "addon",
            id: "community",
            name: "Community Addons"
        }],
        resources: ["catalog"],
        idPrefixes: ["addon"]
    });
});

app.get('/catalog.json', async (req, res) => {
    try {
        const data = await readDatabase();
        res.json(data);
    } catch (error) {
        logger.error('Error serving catalog:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/catalog/:type/:id.json', async (req, res) => {
    try {
        const data = await readDatabase();
        if (req.params.type === 'addon' && req.params.id === 'community') {
            res.json(data);
        } else {
            res.status(404).json({ error: 'Catalog not found' });
        }
    } catch (error) {
        logger.error('Error serving catalog:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Addon Management Routes
app.get('/api/addons', requireAuth, async (req, res) => {
    try {
        const data = await readDatabase();
        res.json(data);
    } catch (error) {
        logger.error('Error reading addons:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/addons', requireAuth, async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'Manifest URL is required' });
        }

        const manifest = await fetchManifest(url);
        const newAddon = {
            transportUrl: url,
            transportName: "http",
            manifest: manifest
        };

        const data = await readDatabase();
        
        const isDuplicate = data.some(addon => 
            addon.manifest.id === manifest.id || 
            addon.transportUrl === url
        );
        
        if (isDuplicate) {
            return res.status(400).json({ error: 'Addon already exists' });
        }

        data.push(newAddon);
        await writeDatabase(data);

        logger.info('Addon added successfully', { 
            url, 
            manifestId: manifest.id
        });
        res.json({ success: true, message: "Addon added successfully" });
    } catch (error) {
        logger.error('Error adding addon:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/addons/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const data = await readDatabase();
        const initialLength = data.length;
        
        const newData = data.filter(addon => addon.manifest.id !== id);
        
        if (newData.length === initialLength) {
            return res.status(404).json({ error: 'Addon not found' });
        }

        await writeDatabase(newData);
        logger.info('Addon deleted successfully', { id });
        res.json({ success: true, message: "Addon deleted successfully" });
    } catch (error) {
        logger.error('Error deleting addon:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check route
app.get('/health', (req, res) => {
    const status = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: "1.0.0"
    };
    logger.debug('Health check', status);
    res.json(status);
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', {
        error: err.stack,
        path: req.path,
        method: req.method,
        ip: req.ip
    });
    
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Initialize and start server
Promise.all([initializeDatabase(), initializeUsersDatabase()])
    .then(() => {
        app.listen(port, () => {
            logger.info(`Server started successfully`, {
                port,
                env: process.env.NODE_ENV || 'development'
            });
            logger.info(`http://localhost:${port}`);
            logger.info('Press Ctrl+C to stop the server');
        });
    })
    .catch(error => {
        logger.error('Failed to initialize:', error);
        process.exit(1);
    });

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    app.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});
