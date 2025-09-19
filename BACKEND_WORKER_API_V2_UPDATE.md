# 🔄 **Backend Updates for Worker API v2**

## 📋 **Overview**
Backend telah diupdate untuk mendukung **FaceFusion Worker API v2** dengan semua 10 processors dan RTX 5090 optimization.

---

## ✅ **Changes Implemented**

### **1. DTO Validations Updated**
Updated `CreateJobDto` untuk support model values yang baru:

```typescript
// Face Swapper Models (Updated)
@IsIn(['blendswap_256', 'inswapper_128', 'inswapper_128_fp16', 'simswap_256', 'simswap_512', 'uniface_256'])
faceSwapperModel?: string;

// Face Enhancer Models (Updated)  
@IsIn(['codeformer', 'gfpgan_1_2', 'gfpgan_1_3', 'gfpgan_1_4', 'gpen_bfr_256', 'gpen_bfr_512', 'gpen_bfr_1024', 'gpen_bfr_2048', 'restoreformer_plus_plus'])
faceEnhancerModel?: string;

// Frame Enhancer Models (Updated)
@IsIn(['real_esrgan_x2plus', 'real_esrgan_x4plus', 'real_esrgan_x4plus_anime_6b', 'real_hatgan_x4'])
frameEnhancerModel?: string;
```

### **2. Enhanced Error Handling**
- ✅ Support detailed worker error debugging
- ✅ Parse JSON error responses dari worker
- ✅ Store worker debug info dalam job.options
- ✅ Better error logging untuk troubleshooting

```typescript
// Enhanced error handling dengan worker debug info
if (status === 'FAILED' && errorMessage) {
  let workerError: any = null;
  try {
    if (errorMessage.includes('{') && errorMessage.includes('}')) {
      workerError = JSON.parse(errorMessage);
    }
  } catch (e) {
    // Error message is not JSON, keep as string
  }
  
  // Store detailed error for debugging
  if (workerError?.debug || workerError?.stderr) {
    updateData.options = {
      ...updateData.options,
      workerError: workerError
    };
  }
}
```

### **3. Updated Capabilities Endpoint**
Updated `/jobs/capabilities` untuk match dengan worker API format:

```json
{
  "processors": {
    "face_swapper": {
      "name": "Face Swap",
      "category": "core",
      "requiresModel": false,
      "defaultModel": "inswapper_128",
      "models": ["blendswap_256", "inswapper_128", "inswapper_128_fp16", "simswap_256", "simswap_512", "uniface_256"]
    },
    "face_enhancer": {
      "requiresModel": true,
      "models": ["codeformer", "gfpgan_1_2", "gfpgan_1_3", "gfpgan_1_4", "gpen_bfr_256", "gpen_bfr_512", "gpen_bfr_1024", "gpen_bfr_2048", "restoreformer_plus_plus"]
    }
  }
}
```

### **4. Backward Compatibility**
- ✅ API contract tetap sama 
- ✅ Existing payloads masih supported
- ✅ Default values untuk missing options
- ✅ Graceful handling untuk old model names

---

## 🎯 **Usage Examples**

### **Minimal Payload (Still Works)**
```json
{
  "sourceAssetId": "uuid...",
  "targetAssetId": "uuid...",
  "processors": ["face_swapper"],
  "options": {
    "faceSwapperModel": "inswapper_128"
  }
}
```

### **Enhanced Payload (New Features)**
```json
{
  "sourceAssetId": "uuid...",
  "targetAssetId": "uuid...",
  "processors": ["face_swapper", "face_enhancer", "frame_enhancer"],
  "options": {
    "faceSwapperModel": "inswapper_128",
    "faceEnhancerModel": "gfpgan_1_4",
    "faceEnhancerBlend": 80,
    "frameEnhancerModel": "real_esrgan_x4plus",
    "frameEnhancerBlend": 90,
    "useCuda": true,
    "outputVideoQuality": 95
  }
}
```

### **Creative Processing Pipeline**
```json
{
  "sourceAssetId": "uuid...",
  "targetAssetId": "uuid...",
  "processors": ["face_swapper", "face_editor", "age_modifier"],
  "options": {
    "faceSwapperModel": "uniface_256",
    "faceEditorModel": "live_portrait",
    "faceEditorParams": {
      "eyeOpenRatio": 1.2,
      "mouthSmile": 0.3
    },
    "ageModifierDirection": -5
  }
}
```

---

## 🔧 **API Endpoints**

### **Get Capabilities**
```http
GET /jobs/capabilities
```
**Response:** Updated processor dan model information

### **Create Job** 
```http
POST /jobs/uploaded
```
**Body:** Enhanced dengan model options baru

### **Worker Callback**
```http
PATCH /jobs/:id/callback
```
**Enhanced:** Support detailed error debugging

---

## 🐳 **Docker Deployment**

Semua perubahan sudah **Docker-ready**:

```bash
# Deploy dengan updates
docker compose up -d --build nestjs

# Test capabilities
curl http://localhost:3000/jobs/capabilities

# Test job creation
curl -X POST http://localhost:3000/jobs/uploaded \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "source=@face.jpg" \
  -F "target=@video.mp4" \
  -F 'processors=["face_swapper", "face_enhancer"]' \
  -F 'options={"faceEnhancerModel": "gfpgan_1_4", "faceEnhancerBlend": 80}'
```

---

## 🏆 **Benefits**

### **For Frontend Developers:**
- ✅ Updated model options available via API
- ✅ Better error messages dengan debugging info
- ✅ Capabilities endpoint untuk dynamic UI generation

### **For Backend Maintenance:**
- ✅ Enhanced error handling dan debugging
- ✅ Better validation untuk model requirements  
- ✅ Backward compatibility maintained

### **For Users:**
- ✅ Access ke semua 10 FaceFusion processors
- ✅ Better quality dengan RTX 5090 optimization
- ✅ More creative options (age modifier, face editor, dll)

---

## ⚠️ **Important Notes**

1. **Model Names Updated:** Beberapa model names berubah (e.g., `gfpgan_1.4` → `gfpgan_1_4`)
2. **Enhanced Debugging:** Error responses sekarang include detailed worker info
3. **Timeout Consideration:** Video processing mungkin butuh timeout lebih lama
4. **GPU Optimization:** Automatic RTX 5090 detection dan optimization

---

## 🧪 **Testing**

### **Test New Models:**
```bash
# Test updated face enhancer models
curl -X POST /jobs/uploaded \
  -F 'options={"faceEnhancerModel": "gpen_bfr_2048"}'

# Test frame enhancer models  
curl -X POST /jobs/uploaded \
  -F 'options={"frameEnhancerModel": "real_esrgan_x4plus_anime_6b"}'
```

### **Test Error Handling:**
```bash
# Submit job dengan invalid model
curl -X POST /jobs/uploaded \
  -F 'options={"faceEnhancerModel": "invalid_model"}'
```

Backend sekarang **fully compatible** dengan FaceFusion Worker API v2! 🚀