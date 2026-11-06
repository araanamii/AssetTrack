/* =========================================
   ASSETTRACK — APPLICATION LOGIC
========================================= */

const API_URL = "https://script.google.com/macros/s/AKfycbwsbHvLE7xmpAcpvba34aJ56Ol7miilVVUMQiTmqcgC0XtyvgQQVN1MPd5D4Q1ZeGTX7A/exec";

let assets = [];
let html5QrCode = null;
let currentAsset = null;
let scannerRunning = false;


/* =========================================
   HELPER FUNCTIONS
========================================= */

function normalizeAsset(row) {
    return {
        assetNumber: String(row["Asset Number"] ?? row.assetNumber ?? "").trim(),
        itemName: String(row["Item Name"] ?? row.itemName ?? "").trim(),
        description: String(row["Description"] ?? row.description ?? "").trim(),
        category: String(row["Category"] ?? row.category ?? "").trim(),
        status: String(row["Status"] ?? row.status ?? "").trim(),
        owner: String(row["Designated Owner"] ?? row.owner ?? "").trim(),
        picture: String(row["Picture"] ?? row.picture ?? "").trim(),
        qrCode: String(row["QR Code"] ?? row.qrCode ?? "").trim()
    };
}

function getAssetByNumber(value) {
    const searchValue = String(value).trim().toLowerCase();

    return assets.find(asset =>
        asset.assetNumber.toLowerCase() === searchValue ||
        asset.qrCode.toLowerCase() === searchValue
    );
}

function getAssetSymbol(asset) {
    const name = String(asset.itemName || "").toLowerCase();

    if (name.includes("chair")) return "🪑";
    if (name.includes("table") || name.includes("desk")) return "🪵";
    if (name.includes("computer")) return "🖥️";

    return "📦";
}

function getStatusClass(status) {
    const value = String(status).toLowerCase();

    if (value === "good") return "good";
    if (value === "bad") return "bad";

    return "unknown";
}

function refreshIcons() {
    if (window.lucide) {
        lucide.createIcons();
    }
}


/* =========================================
   LOAD ASSET RECORDS
========================================= */

async function loadAssets() {
    const inventory = document.getElementById("inventory-list");

    inventory.innerHTML = `
        <div class="loading-state">
            <i data-lucide="loader-circle"></i>
            <p>Loading asset records...</p>
        </div>`;

    refreshIcons();

    try {
        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error("Unable to retrieve asset records.");
        }

        const data = await response.json();

        if (data.success === false) {
            throw new Error(data.message || "The server returned an error.");
        }

        const records = Array.isArray(data)
            ? data
            : data.assets;

        if (!Array.isArray(records)) {
            throw new Error("Unexpected response format.");
        }

        assets = records
            .map(normalizeAsset)
            .filter(asset => asset.assetNumber);

        updateDashboard();
        renderInventory();

    } catch (error) {
        console.error("Asset loading error:", error);

        inventory.innerHTML = `
            <div class="no-results">
                <i data-lucide="alert-circle"></i>
                <h3>Unable to load assets</h3>
                <p>Please check your Google Sheets connection.</p>
            </div>`;

        updateDashboard();
    }

    refreshIcons();
}


/* =========================================
   DASHBOARD STATISTICS
========================================= */

function updateDashboard() {
    const total = assets.length;

    const owners = new Set(
        assets.map(asset => asset.owner).filter(Boolean)
    );

    const good = assets.filter(
        asset => asset.status.toLowerCase() === "good"
    ).length;

    const bad = assets.filter(
        asset => asset.status.toLowerCase() === "bad"
    ).length;

    document.getElementById("total-assets").textContent = total;
    document.getElementById("total-owners").textContent = owners.size;
    document.getElementById("good-assets").textContent = good;
    document.getElementById("bad-assets").textContent = bad;

    document.getElementById("inventory-count").textContent =
        `${total} ${total === 1 ? "asset" : "assets"}`;
}


/* =========================================
   INVENTORY DISPLAY
========================================= */

function renderInventory() {
    const inventory = document.getElementById("inventory-list");

    const searchValue = document
        .getElementById("inventory-search")
        .value.toLowerCase().trim();

    const statusValue = document
        .getElementById("status-filter")
        .value.toLowerCase();

    const categoryValue = document
        .getElementById("category-filter")
        .value.toLowerCase();

    const filteredAssets = assets.filter(asset => {
        const searchableText = [
            asset.assetNumber,
            asset.itemName,
            asset.description,
            asset.category,
            asset.owner
        ].join(" ").toLowerCase();

        return searchableText.includes(searchValue) &&
            (!statusValue || asset.status.toLowerCase() === statusValue) &&
            (!categoryValue || asset.category.toLowerCase() === categoryValue);
    });

    document.getElementById("inventory-count").textContent =
        `${filteredAssets.length} ${filteredAssets.length === 1 ? "asset" : "assets"}`;

    if (filteredAssets.length === 0) {
        inventory.innerHTML = `
            <div class="no-results">
                <i data-lucide="search-x"></i>
                <h3>No assets found</h3>
                <p>Try changing your search or filters.</p>
            </div>`;

        refreshIcons();
        return;
    }

    inventory.innerHTML = filteredAssets.map(asset => {
        const statusClass = getStatusClass(asset.status);

        return `
            <div class="inventory-item"
                 data-asset-number="${escapeHTML(asset.assetNumber)}">

                <div class="inventory-item-info">
                    <div class="inventory-item-image asset-symbol">
                        ${getAssetSymbol(asset)}
                    </div>

                    <div class="inventory-item-text">
                        <h4>${escapeHTML(asset.itemName || "Unnamed Asset")}</h4>
                        <p>Asset #${escapeHTML(asset.assetNumber)} · ${escapeHTML(asset.category)}</p>
                    </div>
                </div>

                <div class="inventory-item-meta">
                    <span class="status-badge ${statusClass}">
                        ${escapeHTML(asset.status || "Unknown")}
                    </span>
                    <i data-lucide="chevron-right"></i>
                </div>
            </div>`;
    }).join("");

    document.querySelectorAll(".inventory-item").forEach(item => {
        item.addEventListener("click", () => {
            const asset = getAssetByNumber(item.dataset.assetNumber);

            if (asset) {
                showAssetDetails(asset);
                switchPage("scanner-section");
            }
        });
    });

    refreshIcons();
}


/* =========================================
   HTML ESCAPING
========================================= */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}


/* =========================================
   ASSET DETAILS
========================================= */

function showAssetDetails(asset) {
    if (!asset) return;

    currentAsset = asset;

    document.getElementById("asset-empty").classList.add("hidden");
    document.getElementById("asset-details").classList.remove("hidden");

    document.getElementById("asset-number").textContent =
        `ASSET #${asset.assetNumber}`;

    document.getElementById("asset-name").textContent =
        asset.itemName || "Unnamed Asset";

    document.getElementById("asset-description").textContent =
        asset.description || "No description available.";

    document.getElementById("asset-category").textContent =
        asset.category || "Not specified";

    document.getElementById("asset-owner").textContent =
        asset.owner || "Unassigned";

    const statusElement = document.getElementById("asset-status");

    statusElement.textContent = asset.status || "Unknown";
    statusElement.className = `status-badge ${getStatusClass(asset.status)}`;

    document.getElementById("asset-symbol").textContent =
        getAssetSymbol(asset);

    document.getElementById("manual-asset").value = asset.assetNumber;

    refreshIcons();
}


/* =========================================
   MANUAL ASSET SEARCH
========================================= */

function searchAsset() {
    const value = document.getElementById("manual-asset").value.trim();

    if (!value) {
        alert("Please enter an asset number.");
        return;
    }

    const asset = getAssetByNumber(value);

    if (!asset) {
        alert("Asset not found. Please check the asset number.");
        return;
    }

    showAssetDetails(asset);
}


/* =========================================
   QR CODE SCANNER
========================================= */

async function startScanner() {
    if (scannerRunning) return;

    if (!window.Html5Qrcode) {
        alert("The QR scanner library could not be loaded.");
        return;
    }

    try {
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode("reader");
        }

        await html5QrCode.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: (viewfinderWidth, viewfinderHeight) => {
                    const size = Math.floor(
                        Math.min(viewfinderWidth, viewfinderHeight) * 0.75
                    );

                    return {
                        width: size,
                        height: size
                    };
                }
            },
            decodedText => {
                const asset = getAssetByNumber(decodedText);

                if (asset) {
                    showAssetDetails(asset);
                    stopScanner();
                } else {
                    alert(`No asset found for QR code: ${decodedText}`);
                }
            },
            () => {}
        );

        scannerRunning = true;

    } catch (error) {
        console.error("Scanner error:", error);

        alert(
            "Unable to start the camera. Please allow camera access and use the app over HTTPS."
        );
    }
}

async function stopScanner() {
    if (!html5QrCode || !scannerRunning) return;

    try {
        await html5QrCode.stop();
        scannerRunning = false;
    } catch (error) {
        console.error("Unable to stop scanner:", error);
    }
}


/* =========================================
   QR CODE GENERATION
========================================= */

function showQRCode() {
    if (!currentAsset) {
        alert("Please select an asset first.");
        return;
    }

    const qrDisplay = document.getElementById("qr-display");
    qrDisplay.innerHTML = "";

    new QRCode(qrDisplay, {
        text: currentAsset.assetNumber,
        width: 190,
        height: 190,
        colorDark: "#34445B",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    document.getElementById("qr-asset-label").textContent =
        `${currentAsset.itemName} · Asset #${currentAsset.assetNumber}`;

    document.getElementById("qr-modal").classList.remove("hidden");
}


/* =========================================
   PAGE NAVIGATION
========================================= */

function switchPage(pageId) {
    document.querySelectorAll(".page-section").forEach(section => {
        section.classList.remove("active");
    });

    document.getElementById(pageId).classList.add("active");

    document.querySelectorAll(".nav-item").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.page === pageId
        );
    });

    if (pageId === "dashboard-section") {
        updateDashboard();
        renderInventory();
    }

    refreshIcons();
}


/* =========================================
   EVENT LISTENERS
========================================= */

document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
        switchPage(button.dataset.page);
    });
});

document.getElementById("start-scan")
    .addEventListener("click", startScanner);

document.getElementById("stop-scan")
    .addEventListener("click", stopScanner);

document.getElementById("manual-search-btn")
    .addEventListener("click", searchAsset);

document.getElementById("manual-asset")
    .addEventListener("keydown", event => {
        if (event.key === "Enter") searchAsset();
    });

document.getElementById("show-qr")
    .addEventListener("click", showQRCode);

document.getElementById("close-qr")
    .addEventListener("click", () => {
        document.getElementById("qr-modal").classList.add("hidden");
    });

document.getElementById("qr-modal")
    .addEventListener("click", event => {
        if (event.target.id === "qr-modal") {
            event.currentTarget.classList.add("hidden");
        }
    });

document.getElementById("inventory-search")
    .addEventListener("input", renderInventory);

document.getElementById("status-filter")
    .addEventListener("change", renderInventory);

document.getElementById("category-filter")
    .addEventListener("change", renderInventory);


/* =========================================
   INITIALIZE APPLICATION
========================================= */

document.addEventListener("DOMContentLoaded", () => {
    refreshIcons();
    loadAssets();
});