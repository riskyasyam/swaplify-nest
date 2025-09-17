# 📋 **Plan Entitlements CRUD API Guide**

## 🔗 **Base URL**
```
http://localhost:3000/entitlements
```

---

## 📚 **Available Endpoints**

### **1. Create Entitlement** 
```http
POST /entitlements
```
**Auth Required:** ADMIN role

**Request Body:**
```json
{
  "planId": 1,
  "version": 2,
  "max_processors_per_job": 3,
  "max_weight_per_job": 5,
  "daily_weight_quota": 25,
  "max_video_sec": 60,
  "max_resolution": "720p",
  "watermark": true,
  "concurrency": 2
}
```

**Response:**
```json
{
  "id": 4,
  "planId": 1,
  "version": 2,
  "entitlements": {
    "max_processors_per_job": 3,
    "max_weight_per_job": 5,
    "daily_weight_quota": 25,
    "max_video_sec": 60,
    "max_resolution": "720p",
    "watermark": true,
    "concurrency": 2
  },
  "plan": {
    "id": 1,
    "code": "FREE",
    "name": "Free Plan"
  }
}
```

### **2. Get All Entitlements**
```http
GET /entitlements
```
**Auth Required:** None (Public)

**Response:**
```json
[
  {
    "id": 1,
    "planId": 1,
    "version": 1,
    "entitlements": {
      "max_processors_per_job": 2,
      "max_weight_per_job": 3,
      "daily_weight_quota": 10,
      "max_video_sec": 30,
      "max_resolution": "480p",
      "watermark": true,
      "concurrency": 1
    },
    "plan": {
      "id": 1,
      "code": "FREE",
      "name": "Free Plan"
    }
  }
]
```

### **3. Get Entitlement by ID**
```http
GET /entitlements/{id}
```
**Auth Required:** None (Public)

### **4. Get Entitlements by Plan ID**
```http
GET /entitlements/plan/{planId}
```
**Auth Required:** None (Public)

**Example:**
```http
GET /entitlements/plan/1
```

### **5. Get Latest Entitlement for Plan**
```http
GET /entitlements/plan/{planId}/latest
```
**Auth Required:** None (Public)

**Example:**
```http
GET /entitlements/plan/1/latest
```

### **6. Update Entitlement**
```http
PUT /entitlements/{id}
```
**Auth Required:** ADMIN role

**Request Body (partial updates allowed):**
```json
{
  "max_video_sec": 90,
  "watermark": false,
  "concurrency": 3
}
```

### **7. Delete Entitlement**
```http
DELETE /entitlements/{id}
```
**Auth Required:** ADMIN role

---

## 🎛️ **Entitlement Fields**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `max_processors_per_job` | number | Max processors in single job | `3` |
| `max_weight_per_job` | number | Max weight per job | `5` |
| `daily_weight_quota` | number | Daily processing quota | `25` |
| `max_video_sec` | number | Max video duration (seconds) | `60` |
| `max_resolution` | string | Max resolution allowed | `"720p"`, `"1080p"`, `"4K"` |
| `watermark` | boolean | Apply watermark to output | `true` / `false` |
| `concurrency` | number | Simultaneous job limit | `2` |

---

## 🎯 **Usage Examples**

### **JavaScript/Frontend Usage**

```javascript
// Create new entitlement
const createEntitlement = async () => {
  const response = await fetch('/entitlements', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_ADMIN_TOKEN'
    },
    body: JSON.stringify({
      planId: 2,
      version: 1,
      max_processors_per_job: 3,
      max_weight_per_job: 5,
      daily_weight_quota: 25,
      max_video_sec: 60,
      max_resolution: "720p",
      watermark: true,
      concurrency: 2
    })
  });
  
  const entitlement = await response.json();
  console.log('Created entitlement:', entitlement);
};

// Get latest entitlement for a plan
const getLatestEntitlement = async (planId) => {
  const response = await fetch(`/entitlements/plan/${planId}/latest`);
  const entitlement = await response.json();
  return entitlement.entitlements; // Extract the actual limits
};

// Update entitlement
const updateEntitlement = async (id, updates) => {
  const response = await fetch(`/entitlements/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_ADMIN_TOKEN'
    },
    body: JSON.stringify(updates)
  });
  
  return response.json();
};
```

---

## 🔄 **Migration from Old API**

### **Old Way (via Plans):**
```http
POST /plans/{id}/entitlements
```

### **New Way (Direct CRUD):**
```http
POST /entitlements
GET /entitlements
PUT /entitlements/{id}
DELETE /entitlements/{id}
```

**Benefits:**
- ✅ Full CRUD operations
- ✅ Better separation of concerns
- ✅ Individual entitlement management
- ✅ Easier to track versions
- ✅ All required fields included

---

## 📊 **Default Plan Entitlements**

### **FREE Plan**
```json
{
  "max_processors_per_job": 2,
  "max_weight_per_job": 3,
  "daily_weight_quota": 10,
  "max_video_sec": 30,
  "max_resolution": "480p",
  "watermark": true,
  "concurrency": 1
}
```

### **PREMIUM Plan**
```json
{
  "max_processors_per_job": 3,
  "max_weight_per_job": 5,
  "daily_weight_quota": 25,
  "max_video_sec": 60,
  "max_resolution": "720p",
  "watermark": true,
  "concurrency": 2
}
```

### **PRO Plan**
```json
{
  "max_processors_per_job": 4,
  "max_weight_per_job": 8,
  "daily_weight_quota": 60,
  "max_video_sec": 120,
  "max_resolution": "1080p",
  "watermark": false,
  "concurrency": 3
}
```

---

## ⚠️ **Important Notes**

1. **Versioning:** Each plan can have multiple entitlement versions
2. **Admin Only:** Create, Update, Delete require ADMIN role
3. **Public Access:** Read operations are public
4. **Validation:** All numeric fields have minimum value validation
5. **JSON Storage:** Entitlements stored as JSON for flexibility

---

## 🐳 **Testing with Docker**

```bash
# Start backend
docker compose up -d --build nestjs

# Test endpoints
curl -X GET "http://localhost:3000/entitlements"
curl -X GET "http://localhost:3000/entitlements/plan/1/latest"
```

All entitlement data is seeded automatically with Docker deployment! 🚀