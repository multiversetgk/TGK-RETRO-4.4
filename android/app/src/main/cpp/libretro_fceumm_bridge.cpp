#include <jni.h>
#include <dlfcn.h>
#include <android/log.h>

#include <algorithm>
#include <atomic>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <string>
#include <vector>

#include "libretro.h"

namespace {

constexpr const char* kLogTag = "TGK_NES_BRIDGE";
constexpr int kNesWidth = 256;
constexpr int kNesHeight = 240;
constexpr int kNesPixels = kNesWidth * kNesHeight;
constexpr size_t kAudioRingCapacity = 32768; // stereo int16 samples

// Function pointer table loaded via dlopen() from libfceumm_libretro_android.so
using fn_retro_init = void (*)();
using fn_retro_deinit = void (*)();
using fn_retro_api_version = unsigned (*)();
using fn_retro_get_system_info = void (*)(struct retro_system_info*);
using fn_retro_get_system_av_info = void (*)(struct retro_system_av_info*);
using fn_retro_set_environment = void (*)(retro_environment_t);
using fn_retro_set_video_refresh = void (*)(retro_video_refresh_t);
using fn_retro_set_audio_sample = void (*)(retro_audio_sample_t);
using fn_retro_set_audio_sample_batch = void (*)(retro_audio_sample_batch_t);
using fn_retro_set_input_poll = void (*)(retro_input_poll_t);
using fn_retro_set_input_state = void (*)(retro_input_state_t);
using fn_retro_set_controller_port_device = void (*)(unsigned, unsigned);
using fn_retro_reset = void (*)();
using fn_retro_run = void (*)();
using fn_retro_serialize_size = size_t (*)();
using fn_retro_serialize = bool (*)(void*, size_t);
using fn_retro_unserialize = bool (*)(const void*, size_t);
using fn_retro_load_game = bool (*)(const struct retro_game_info*);
using fn_retro_unload_game = void (*)();
using fn_retro_get_memory_data = void* (*)(unsigned);
using fn_retro_get_memory_size = size_t (*)(unsigned);

struct LibretroCoreSymbols {
    void* handle = nullptr;
    fn_retro_init retro_init = nullptr;
    fn_retro_deinit retro_deinit = nullptr;
    fn_retro_api_version retro_api_version = nullptr;
    fn_retro_get_system_info retro_get_system_info = nullptr;
    fn_retro_get_system_av_info retro_get_system_av_info = nullptr;
    fn_retro_set_environment retro_set_environment = nullptr;
    fn_retro_set_video_refresh retro_set_video_refresh = nullptr;
    fn_retro_set_audio_sample retro_set_audio_sample = nullptr;
    fn_retro_set_audio_sample_batch retro_set_audio_sample_batch = nullptr;
    fn_retro_set_input_poll retro_set_input_poll = nullptr;
    fn_retro_set_input_state retro_set_input_state = nullptr;
    fn_retro_set_controller_port_device retro_set_controller_port_device = nullptr;
    fn_retro_reset retro_reset = nullptr;
    fn_retro_run retro_run = nullptr;
    fn_retro_serialize_size retro_serialize_size = nullptr;
    fn_retro_serialize retro_serialize = nullptr;
    fn_retro_unserialize retro_unserialize = nullptr;
    fn_retro_load_game retro_load_game = nullptr;
    fn_retro_unload_game retro_unload_game = nullptr;
    fn_retro_get_memory_data retro_get_memory_data = nullptr;
    fn_retro_get_memory_size retro_get_memory_size = nullptr;
};

LibretroCoreSymbols g_core;
std::mutex g_coreMutex;

bool g_initialized = false;
bool g_gameLoaded = false;

std::string g_systemDir;
std::string g_coreVersion = "FCEUmm (libretro)";
enum retro_pixel_format g_pixelFormat = RETRO_PIXEL_FORMAT_RGB565;

double g_fps = 60.0988;
int g_sampleRate = 44100;

std::vector<uint8_t> g_romData;
std::string g_romPath;

// ARGB_8888 output frame buffer (256x240)
std::vector<int32_t> g_frameBuffer(kNesPixels, static_cast<int32_t>(0xFF000000));
bool g_hasNewFrame = false;
bool g_suppressVideo = false;
bool g_suppressAudio = false;
std::vector<uint8_t> g_checksumScratch;

// Lock-free 16-bit joypad bitmasks for Port 0 (P1) and Port 1 (P2)
std::atomic<uint16_t> g_portMasks[2] = {0, 0};

// Maps canonical TGK RETRO 2.0 8-bit NES bitmask (A=0,B=1,SEL=2,START=3,U=4,D=5,L=6,R=7)
// to Libretro RETRO_DEVICE_ID_JOYPAD_* bitmask.
uint16_t nesMaskToRetroMask(int nesMask) {
    uint16_t retro = 0;
    if (nesMask & (1 << 0)) retro |= static_cast<uint16_t>(1u << RETRO_DEVICE_ID_JOYPAD_A);
    if (nesMask & (1 << 1)) retro |= static_cast<uint16_t>(1u << RETRO_DEVICE_ID_JOYPAD_B);
    if (nesMask & (1 << 2)) retro |= static_cast<uint16_t>(1u << RETRO_DEVICE_ID_JOYPAD_SELECT);
    if (nesMask & (1 << 3)) retro |= static_cast<uint16_t>(1u << RETRO_DEVICE_ID_JOYPAD_START);
    if (nesMask & (1 << 4)) retro |= static_cast<uint16_t>(1u << RETRO_DEVICE_ID_JOYPAD_UP);
    if (nesMask & (1 << 5)) retro |= static_cast<uint16_t>(1u << RETRO_DEVICE_ID_JOYPAD_DOWN);
    if (nesMask & (1 << 6)) retro |= static_cast<uint16_t>(1u << RETRO_DEVICE_ID_JOYPAD_LEFT);
    if (nesMask & (1 << 7)) retro |= static_cast<uint16_t>(1u << RETRO_DEVICE_ID_JOYPAD_RIGHT);
    return retro;
}

// Thread-safe audio ring buffer (interleaved stereo PCM16)
std::mutex g_audioMutex;
int16_t g_audioRing[kAudioRingCapacity];
size_t g_audioReadPos = 0;
size_t g_audioWritePos = 0;
size_t g_audioCount = 0;

void pushAudioSamples(const int16_t* samples, size_t sampleCount) {
    if (!samples || sampleCount == 0) return;
    std::lock_guard<std::mutex> lock(g_audioMutex);
    for (size_t i = 0; i < sampleCount; ++i) {
        if (g_audioCount == kAudioRingCapacity) {
            // Overwrite oldest sample to keep latency bounded
            g_audioReadPos = (g_audioReadPos + 1) % kAudioRingCapacity;
            --g_audioCount;
        }
        g_audioRing[g_audioWritePos] = samples[i];
        g_audioWritePos = (g_audioWritePos + 1) % kAudioRingCapacity;
        ++g_audioCount;
    }
}

void clearAudioBuffer() {
    std::lock_guard<std::mutex> lock(g_audioMutex);
    g_audioReadPos = 0;
    g_audioWritePos = 0;
    g_audioCount = 0;
}

void retroLogCallback(enum retro_log_level level, const char* fmt, ...) {
    int prio = ANDROID_LOG_INFO;
    switch (level) {
        case RETRO_LOG_DEBUG: prio = ANDROID_LOG_DEBUG; break;
        case RETRO_LOG_INFO:  prio = ANDROID_LOG_INFO;  break;
        case RETRO_LOG_WARN:  prio = ANDROID_LOG_WARN;  break;
        case RETRO_LOG_ERROR: prio = ANDROID_LOG_ERROR; break;
        default: break;
    }
    va_list args;
    va_start(args, fmt);
    __android_log_vprint(prio, kLogTag, fmt, args);
    va_end(args);
}

bool environmentCallback(unsigned cmd, void* data) {
    switch (cmd) {
        case RETRO_ENVIRONMENT_GET_CAN_DUPE: {
            if (data) {
                *static_cast<bool*>(data) = true;
                return true;
            }
            return false;
        }
        case RETRO_ENVIRONMENT_GET_OVERSCAN: {
            if (data) {
                *static_cast<bool*>(data) = false;
                return true;
            }
            return false;
        }
        case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: {
            if (!data) return false;
            const auto fmt = *static_cast<const enum retro_pixel_format*>(data);
            if (fmt == RETRO_PIXEL_FORMAT_RGB565 ||
                fmt == RETRO_PIXEL_FORMAT_XRGB8888 ||
                fmt == RETRO_PIXEL_FORMAT_0RGB1555) {
                g_pixelFormat = fmt;
                return true;
            }
            return false;
        }
        case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
        case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: {
            if (data) {
                *static_cast<const char**>(data) = g_systemDir.empty() ? nullptr : g_systemDir.c_str();
                return !g_systemDir.empty();
            }
            return false;
        }
        case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: {
            if (data) {
                auto* cb = static_cast<struct retro_log_callback*>(data);
                cb->log = retroLogCallback;
                return true;
            }
            return false;
        }
        case RETRO_ENVIRONMENT_GET_INPUT_BITMASKS: {
            return true;
        }
        case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: {
            if (data) {
                *static_cast<bool*>(data) = false;
                return true;
            }
            return false;
        }
        case RETRO_ENVIRONMENT_GET_VARIABLE: {
            if (data) {
                auto* var = static_cast<struct retro_variable*>(data);
                var->value = nullptr;
            }
            return false;
        }
        case RETRO_ENVIRONMENT_SET_SYSTEM_AV_INFO: {
            if (data) {
                const auto* av = static_cast<const struct retro_system_av_info*>(data);
                if (av->timing.fps > 10.0) g_fps = av->timing.fps;
                if (av->timing.sample_rate > 8000.0) g_sampleRate = static_cast<int>(av->timing.sample_rate);
            }
            return true;
        }
        case RETRO_ENVIRONMENT_SET_GEOMETRY:
        case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS:
        case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:
        case RETRO_ENVIRONMENT_SET_VARIABLES:
        case RETRO_ENVIRONMENT_SET_SERIALIZATION_QUIRKS:
        case RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME:
            return true;
        default:
            return false;
    }
}

void videoRefreshCallback(const void* data, unsigned width, unsigned height, size_t pitch) {
    if (g_suppressVideo || !data || width == 0 || height == 0) {
        return; // Silent rollback frame or duped frame
    }

    const int copyW = std::min<int>(static_cast<int>(width), kNesWidth);
    const int copyH = std::min<int>(static_cast<int>(height), kNesHeight);
    const int offsetX = (kNesWidth - copyW) / 2;
    const int offsetY = (kNesHeight - copyH) / 2;

    if (copyW < kNesWidth || copyH < kNesHeight) {
        std::fill(g_frameBuffer.begin(), g_frameBuffer.end(), static_cast<int32_t>(0xFF000000));
    }

    const auto* srcBytes = static_cast<const uint8_t*>(data);

    if (g_pixelFormat == RETRO_PIXEL_FORMAT_XRGB8888) {
        for (int y = 0; y < copyH; ++y) {
            const auto* srcRow = reinterpret_cast<const uint32_t*>(srcBytes + static_cast<size_t>(y) * pitch);
            int32_t* dstRow = g_frameBuffer.data() + (y + offsetY) * kNesWidth + offsetX;
            for (int x = 0; x < copyW; ++x) {
                dstRow[x] = static_cast<int32_t>(0xFF000000u | (srcRow[x] & 0x00FFFFFFu));
            }
        }
    } else if (g_pixelFormat == RETRO_PIXEL_FORMAT_RGB565) {
        for (int y = 0; y < copyH; ++y) {
            const auto* srcRow = reinterpret_cast<const uint16_t*>(srcBytes + static_cast<size_t>(y) * pitch);
            int32_t* dstRow = g_frameBuffer.data() + (y + offsetY) * kNesWidth + offsetX;
            for (int x = 0; x < copyW; ++x) {
                const uint16_t p = srcRow[x];
                const uint32_t r = ((p >> 11) & 0x1Fu) * 255u / 31u;
                const uint32_t g = ((p >> 5) & 0x3Fu) * 255u / 63u;
                const uint32_t b = (p & 0x1Fu) * 255u / 31u;
                dstRow[x] = static_cast<int32_t>(0xFF000000u | (r << 16) | (g << 8) | b);
            }
        }
    } else {
        // RETRO_PIXEL_FORMAT_0RGB1555
        for (int y = 0; y < copyH; ++y) {
            const auto* srcRow = reinterpret_cast<const uint16_t*>(srcBytes + static_cast<size_t>(y) * pitch);
            int32_t* dstRow = g_frameBuffer.data() + (y + offsetY) * kNesWidth + offsetX;
            for (int x = 0; x < copyW; ++x) {
                const uint16_t p = srcRow[x];
                const uint32_t r = ((p >> 10) & 0x1Fu) * 255u / 31u;
                const uint32_t g = ((p >> 5) & 0x1Fu) * 255u / 31u;
                const uint32_t b = (p & 0x1Fu) * 255u / 31u;
                dstRow[x] = static_cast<int32_t>(0xFF000000u | (r << 16) | (g << 8) | b);
            }
        }
    }

    g_hasNewFrame = true;
}

void audioSampleCallback(int16_t left, int16_t right) {
    if (g_suppressAudio) return;
    const int16_t frame[2] = {left, right};
    pushAudioSamples(frame, 2);
}

size_t audioSampleBatchCallback(const int16_t* data, size_t frames) {
    if (!g_suppressAudio && data && frames > 0) {
        pushAudioSamples(data, frames * 2);
    }
    return frames;
}

void inputPollCallback() {
    // Inputs are updated atomically from Android UI/Gamepad/Netplay threads
}

int16_t inputStateCallback(unsigned port, unsigned device, unsigned /*index*/, unsigned id) {
    if (port >= 2) return 0;
    if ((device & RETRO_DEVICE_MASK) != RETRO_DEVICE_JOYPAD) return 0;

    const uint16_t mask = g_portMasks[port].load(std::memory_order_acquire);
    if (id == RETRO_DEVICE_ID_JOYPAD_MASK) {
        return static_cast<int16_t>(mask);
    }
    if (id < 16) {
        return (mask & static_cast<uint16_t>(1u << id)) ? 1 : 0;
    }
    return 0;
}

template <typename Fn>
bool loadSymbol(void* handle, const char* name, Fn& out) {
    out = reinterpret_cast<Fn>(dlsym(handle, name));
    if (!out) {
        __android_log_print(ANDROID_LOG_ERROR, kLogTag, "Missing libretro symbol: %s", name);
        return false;
    }
    return true;
}

void shutdownLocked() {
    if (g_gameLoaded && g_core.retro_unload_game) {
        g_core.retro_unload_game();
        g_gameLoaded = false;
    }
    if (g_initialized && g_core.retro_deinit) {
        g_core.retro_deinit();
        g_initialized = false;
    }
    if (g_core.handle) {
        dlclose(g_core.handle);
        g_core = LibretroCoreSymbols{};
    }
    g_romData.clear();
    g_romPath.clear();
    clearAudioBuffer();
}

} // namespace

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeInitCore(
    JNIEnv* env,
    jobject /*thiz*/,
    jstring jNativeLibDir,
    jstring jSystemDir
) {
    std::lock_guard<std::mutex> lock(g_coreMutex);
    shutdownLocked();

    const char* libDirChars = env->GetStringUTFChars(jNativeLibDir, nullptr);
    const char* sysDirChars = env->GetStringUTFChars(jSystemDir, nullptr);
    std::string libPath = std::string(libDirChars ? libDirChars : "") + "/libfceumm_libretro_android.so";
    g_systemDir = sysDirChars ? sysDirChars : "";
    if (libDirChars) env->ReleaseStringUTFChars(jNativeLibDir, libDirChars);
    if (sysDirChars) env->ReleaseStringUTFChars(jSystemDir, sysDirChars);

    void* handle = dlopen(libPath.c_str(), RTLD_LAZY);
    if (!handle) {
        // Fallback to standard Android linker namespace lookup
        handle = dlopen("libfceumm_libretro_android.so", RTLD_LAZY);
    }
    if (!handle) {
        __android_log_print(
            ANDROID_LOG_ERROR,
            kLogTag,
            "Failed to dlopen FCEUmm core at %s: %s",
            libPath.c_str(),
            dlerror()
        );
        return JNI_FALSE;
    }

    g_core.handle = handle;
    bool ok =
        loadSymbol(handle, "retro_init", g_core.retro_init) &&
        loadSymbol(handle, "retro_deinit", g_core.retro_deinit) &&
        loadSymbol(handle, "retro_api_version", g_core.retro_api_version) &&
        loadSymbol(handle, "retro_get_system_info", g_core.retro_get_system_info) &&
        loadSymbol(handle, "retro_get_system_av_info", g_core.retro_get_system_av_info) &&
        loadSymbol(handle, "retro_set_environment", g_core.retro_set_environment) &&
        loadSymbol(handle, "retro_set_video_refresh", g_core.retro_set_video_refresh) &&
        loadSymbol(handle, "retro_set_audio_sample", g_core.retro_set_audio_sample) &&
        loadSymbol(handle, "retro_set_audio_sample_batch", g_core.retro_set_audio_sample_batch) &&
        loadSymbol(handle, "retro_set_input_poll", g_core.retro_set_input_poll) &&
        loadSymbol(handle, "retro_set_input_state", g_core.retro_set_input_state) &&
        loadSymbol(handle, "retro_set_controller_port_device", g_core.retro_set_controller_port_device) &&
        loadSymbol(handle, "retro_reset", g_core.retro_reset) &&
        loadSymbol(handle, "retro_run", g_core.retro_run) &&
        loadSymbol(handle, "retro_serialize_size", g_core.retro_serialize_size) &&
        loadSymbol(handle, "retro_serialize", g_core.retro_serialize) &&
        loadSymbol(handle, "retro_unserialize", g_core.retro_unserialize) &&
        loadSymbol(handle, "retro_load_game", g_core.retro_load_game) &&
        loadSymbol(handle, "retro_unload_game", g_core.retro_unload_game);

    // Optional WRAM inspection hooks for verified NES Champions achievements & VS Race judge
    g_core.retro_get_memory_data = reinterpret_cast<fn_retro_get_memory_data>(
        dlsym(handle, "retro_get_memory_data")
    );
    g_core.retro_get_memory_size = reinterpret_cast<fn_retro_get_memory_size>(
        dlsym(handle, "retro_get_memory_size")
    );

    if (!ok) {
        shutdownLocked();
        return JNI_FALSE;
    }

    g_core.retro_set_environment(environmentCallback);
    g_core.retro_set_video_refresh(videoRefreshCallback);
    g_core.retro_set_audio_sample(audioSampleCallback);
    g_core.retro_set_audio_sample_batch(audioSampleBatchCallback);
    g_core.retro_set_input_poll(inputPollCallback);
    g_core.retro_set_input_state(inputStateCallback);

    g_core.retro_init();
    g_initialized = true;

    struct retro_system_info sysInfo {};
    g_core.retro_get_system_info(&sysInfo);
    if (sysInfo.library_name && sysInfo.library_version) {
        g_coreVersion = std::string(sysInfo.library_name) + " " + std::string(sysInfo.library_version);
    }

    __android_log_print(ANDROID_LOG_INFO, kLogTag, "Initialized core: %s", g_coreVersion.c_str());
    return JNI_TRUE;
}

JNIEXPORT jboolean JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeLoadRom(
    JNIEnv* env,
    jobject /*thiz*/,
    jbyteArray jRomBytes,
    jstring jRomPath
) {
    std::lock_guard<std::mutex> lock(g_coreMutex);
    if (!g_initialized || !g_core.retro_load_game) {
        return JNI_FALSE;
    }

    if (g_gameLoaded && g_core.retro_unload_game) {
        g_core.retro_unload_game();
        g_gameLoaded = false;
    }

    const jsize length = env->GetArrayLength(jRomBytes);
    if (length < 16) {
        return JNI_FALSE;
    }

    g_romData.resize(static_cast<size_t>(length));
    env->GetByteArrayRegion(jRomBytes, 0, length, reinterpret_cast<jbyte*>(g_romData.data()));

    const char* pathChars = env->GetStringUTFChars(jRomPath, nullptr);
    g_romPath = pathChars ? pathChars : "cartridge.nes";
    if (pathChars) env->ReleaseStringUTFChars(jRomPath, pathChars);

    clearAudioBuffer();
    g_portMasks[0].store(0, std::memory_order_release);
    g_portMasks[1].store(0, std::memory_order_release);
    std::fill(g_frameBuffer.begin(), g_frameBuffer.end(), static_cast<int32_t>(0xFF000000));
    g_hasNewFrame = false;

    struct retro_game_info gameInfo {};
    gameInfo.path = g_romPath.c_str();
    gameInfo.data = g_romData.data();
    gameInfo.size = g_romData.size();
    gameInfo.meta = nullptr;

    if (!g_core.retro_load_game(&gameInfo)) {
        __android_log_print(ANDROID_LOG_ERROR, kLogTag, "retro_load_game failed for %s", g_romPath.c_str());
        return JNI_FALSE;
    }

    // Bind standard 2-player joypads on Port 0 and Port 1
    g_core.retro_set_controller_port_device(0, RETRO_DEVICE_JOYPAD);
    g_core.retro_set_controller_port_device(1, RETRO_DEVICE_JOYPAD);

    struct retro_system_av_info avInfo {};
    g_core.retro_get_system_av_info(&avInfo);
    if (avInfo.timing.fps > 10.0) g_fps = avInfo.timing.fps;
    if (avInfo.timing.sample_rate > 8000.0) g_sampleRate = static_cast<int>(avInfo.timing.sample_rate);

    g_gameLoaded = true;
    __android_log_print(
        ANDROID_LOG_INFO,
        kLogTag,
        "Loaded ROM (%zu bytes), FPS=%.2f, Audio=%dHz",
        g_romData.size(),
        g_fps,
        g_sampleRate
    );
    return JNI_TRUE;
}

JNIEXPORT void JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeUnloadRom(
    JNIEnv* /*env*/,
    jobject /*thiz*/
) {
    std::lock_guard<std::mutex> lock(g_coreMutex);
    if (g_gameLoaded && g_core.retro_unload_game) {
        g_core.retro_unload_game();
        g_gameLoaded = false;
    }
    g_romData.clear();
    clearAudioBuffer();
}

JNIEXPORT jboolean JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeStepFrame(
    JNIEnv* env,
    jobject /*thiz*/,
    jintArray jOutArgbPixels
) {
    std::lock_guard<std::mutex> lock(g_coreMutex);
    if (!g_gameLoaded || !g_core.retro_run) {
        return JNI_FALSE;
    }

    g_hasNewFrame = false;
    g_core.retro_run();

    if (jOutArgbPixels != nullptr && env->GetArrayLength(jOutArgbPixels) >= kNesPixels) {
        env->SetIntArrayRegion(
            jOutArgbPixels,
            0,
            kNesPixels,
            reinterpret_cast<const jint*>(g_frameBuffer.data())
        );
    }

    return g_hasNewFrame ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeStepFrameDeterministic(
    JNIEnv* env,
    jobject /*thiz*/,
    jint p1NesMask,
    jint p2NesMask,
    jboolean renderVideo,
    jboolean recordAudio,
    jintArray jOutArgbPixels
) {
    std::lock_guard<std::mutex> lock(g_coreMutex);
    if (!g_gameLoaded || !g_core.retro_run) {
        return JNI_FALSE;
    }

    // Atomically latch exact deterministic Port 0 & Port 1 bitmasks before stepping core
    g_portMasks[0].store(nesMaskToRetroMask(p1NesMask), std::memory_order_release);
    g_portMasks[1].store(nesMaskToRetroMask(p2NesMask), std::memory_order_release);

    g_suppressVideo = (renderVideo != JNI_TRUE);
    g_suppressAudio = (recordAudio != JNI_TRUE);
    g_hasNewFrame = false;

    g_core.retro_run();

    g_suppressVideo = false;
    g_suppressAudio = false;

    if (renderVideo == JNI_TRUE && jOutArgbPixels != nullptr && env->GetArrayLength(jOutArgbPixels) >= kNesPixels) {
        env->SetIntArrayRegion(
            jOutArgbPixels,
            0,
            kNesPixels,
            reinterpret_cast<const jint*>(g_frameBuffer.data())
        );
    }

    return g_hasNewFrame ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jint JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeGetSerializeSize(
    JNIEnv* /*env*/,
    jobject /*thiz*/
) {
    std::lock_guard<std::mutex> lock(g_coreMutex);
    if (!g_gameLoaded || !g_core.retro_serialize_size) {
        return 0;
    }
    return static_cast<jint>(g_core.retro_serialize_size());
}

JNIEXPORT jstring JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeComputeStateChecksum(
    JNIEnv* env,
    jobject /*thiz*/
) {
    std::lock_guard<std::mutex> lock(g_coreMutex);
    if (!g_gameLoaded || !g_core.retro_serialize_size || !g_core.retro_serialize) {
        return env->NewStringUTF("00000000");
    }

    const size_t size = g_core.retro_serialize_size();
    if (size == 0) {
        return env->NewStringUTF("00000000");
    }
    if (g_checksumScratch.size() != size) {
        g_checksumScratch.resize(size);
    }
    if (!g_core.retro_serialize(g_checksumScratch.data(), size)) {
        return env->NewStringUTF("00000000");
    }

    // Deterministic FNV-1a 32-bit digest over serialized emulator state bytes
    uint32_t hash = 2166136261u;
    for (size_t i = 0; i < size; ++i) {
        hash ^= static_cast<uint32_t>(g_checksumScratch[i]);
        hash *= 16777619u;
    }

    char hex[16];
    std::snprintf(hex, sizeof(hex), "%08x", hash);
    return env->NewStringUTF(hex);
}

JNIEXPORT jint JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeDrainAudio(
    JNIEnv* env,
    jobject /*thiz*/,
    jshortArray jOutPcmStereo
) {
    if (!jOutPcmStereo) return 0;
    const jsize maxShorts = env->GetArrayLength(jOutPcmStereo);
    if (maxShorts <= 0) return 0;

    std::vector<int16_t> temp;
    {
        std::lock_guard<std::mutex> lock(g_audioMutex);
        const size_t toRead = std::min<size_t>(g_audioCount, static_cast<size_t>(maxShorts));
        if (toRead == 0) return 0;
        temp.resize(toRead);
        for (size_t i = 0; i < toRead; ++i) {
            temp[i] = g_audioRing[g_audioReadPos];
            g_audioReadPos = (g_audioReadPos + 1) % kAudioRingCapacity;
        }
        g_audioCount -= toRead;
    }

    env->SetShortArrayRegion(
        jOutPcmStereo,
        0,
        static_cast<jsize>(temp.size()),
        reinterpret_cast<const jshort*>(temp.data())
    );
    return static_cast<jint>(temp.size());
}

JNIEXPORT void JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeSetButton(
    JNIEnv* /*env*/,
    jobject /*thiz*/,
    jint port,
    jint retroButtonId,
    jboolean pressed
) {
    if (port < 0 || port > 1 || retroButtonId < 0 || retroButtonId >= 16) return;
    const uint16_t bit = static_cast<uint16_t>(1u << retroButtonId);
    if (pressed == JNI_TRUE) {
        g_portMasks[port].fetch_or(bit, std::memory_order_acq_rel);
    } else {
        g_portMasks[port].fetch_and(static_cast<uint16_t>(~bit), std::memory_order_acq_rel);
    }
}

JNIEXPORT void JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeClearPortInputs(
    JNIEnv* /*env*/,
    jobject /*thiz*/,
    jint port
) {
    if (port < 0 || port > 1) return;
    g_portMasks[port].store(0, std::memory_order_release);
}

JNIEXPORT void JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeReset(
    JNIEnv* /*env*/,
    jobject /*thiz*/
) {
    std::lock_guard<std::mutex> lock(g_coreMutex);
    if (g_gameLoaded && g_core.retro_reset) {
        g_core.retro_reset();
        clearAudioBuffer();
    }
}

JNIEXPORT jbyteArray JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeSaveState(
    JNIEnv* env,
    jobject /*thiz*/
) {
    std::lock_guard<std::mutex> lock(g_coreMutex);
    if (!g_gameLoaded || !g_core.retro_serialize_size || !g_core.retro_serialize) {
        return nullptr;
    }

    const size_t size = g_core.retro_serialize_size();
    if (size == 0) return nullptr;

    std::vector<uint8_t> state(size);
    if (!g_core.retro_serialize(state.data(), size)) {
        return nullptr;
    }

    jbyteArray out = env->NewByteArray(static_cast<jsize>(size));
    if (out) {
        env->SetByteArrayRegion(out, 0, static_cast<jsize>(size), reinterpret_cast<const jbyte*>(state.data()));
    }
    return out;
}

JNIEXPORT jboolean JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeLoadState(
    JNIEnv* env,
    jobject /*thiz*/,
    jbyteArray jStateBytes
) {
    std::lock_guard<std::mutex> lock(g_coreMutex);
    if (!g_gameLoaded || !g_core.retro_unserialize || !jStateBytes) {
        return JNI_FALSE;
    }

    const jsize length = env->GetArrayLength(jStateBytes);
    if (length <= 0) return JNI_FALSE;

    std::vector<uint8_t> state(static_cast<size_t>(length));
    env->GetByteArrayRegion(jStateBytes, 0, length, reinterpret_cast<jbyte*>(state.data()));

    const bool ok = g_core.retro_unserialize(state.data(), state.size());
    if (ok) {
        clearAudioBuffer();
    }
    return ok ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jint JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeGetSampleRate(
    JNIEnv* /*env*/,
    jobject /*thiz*/
) {
    return static_cast<jint>(g_sampleRate);
}

JNIEXPORT jdouble JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeGetFps(
    JNIEnv* /*env*/,
    jobject /*thiz*/
) {
    return static_cast<jdouble>(g_fps);
}

JNIEXPORT jstring JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeGetCoreVersion(
    JNIEnv* env,
    jobject /*thiz*/
) {
    std::lock_guard<std::mutex> lock(g_coreMutex);
    return env->NewStringUTF(g_coreVersion.c_str());
}

JNIEXPORT jboolean JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeReadSystemRam(
    JNIEnv* env,
    jobject /*thiz*/,
    jbyteArray jOutRam
) {
    if (!jOutRam) return JNI_FALSE;
    std::lock_guard<std::mutex> lock(g_coreMutex);
    if (!g_gameLoaded || !g_core.retro_get_memory_data || !g_core.retro_get_memory_size) {
        return JNI_FALSE;
    }

    const size_t ramSize = g_core.retro_get_memory_size(RETRO_MEMORY_SYSTEM_RAM);
    const void* ramPtr = g_core.retro_get_memory_data(RETRO_MEMORY_SYSTEM_RAM);
    if (!ramPtr || ramSize == 0) {
        return JNI_FALSE;
    }

    const jsize outLen = env->GetArrayLength(jOutRam);
    if (outLen <= 0) return JNI_FALSE;

    const size_t copyLen = std::min<size_t>(ramSize, static_cast<size_t>(outLen));
    env->SetByteArrayRegion(
        jOutRam,
        0,
        static_cast<jsize>(copyLen),
        reinterpret_cast<const jbyte*>(ramPtr)
    );
    return JNI_TRUE;
}

JNIEXPORT jbyteArray JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeReadSaveRam(
    JNIEnv* env,
    jobject /*thiz*/
) {
    std::lock_guard<std::mutex> lock(g_coreMutex);
    if (!g_gameLoaded || !g_core.retro_get_memory_data || !g_core.retro_get_memory_size) {
        return nullptr;
    }
    const size_t size = g_core.retro_get_memory_size(RETRO_MEMORY_SAVE_RAM);
    const void* ptr = g_core.retro_get_memory_data(RETRO_MEMORY_SAVE_RAM);
    if (!ptr || size == 0) {
        return nullptr; // Cartridge has no battery-backed RAM
    }
    jbyteArray out = env->NewByteArray(static_cast<jsize>(size));
    if (out) {
        env->SetByteArrayRegion(out, 0, static_cast<jsize>(size), reinterpret_cast<const jbyte*>(ptr));
    }
    return out;
}

JNIEXPORT jboolean JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeWriteSaveRam(
    JNIEnv* env,
    jobject /*thiz*/,
    jbyteArray jData
) {
    if (!jData) return JNI_FALSE;
    std::lock_guard<std::mutex> lock(g_coreMutex);
    if (!g_gameLoaded || !g_core.retro_get_memory_data || !g_core.retro_get_memory_size) {
        return JNI_FALSE;
    }
    const size_t size = g_core.retro_get_memory_size(RETRO_MEMORY_SAVE_RAM);
    void* ptr = g_core.retro_get_memory_data(RETRO_MEMORY_SAVE_RAM);
    if (!ptr || size == 0) {
        return JNI_FALSE;
    }
    const jsize len = env->GetArrayLength(jData);
    if (len <= 0) return JNI_FALSE;
    const size_t copyLen = std::min<size_t>(size, static_cast<size_t>(len));
    env->GetByteArrayRegion(jData, 0, static_cast<jsize>(copyLen), reinterpret_cast<jbyte*>(ptr));
    return JNI_TRUE;
}

JNIEXPORT void JNICALL
Java_com_tgk_testemulators_core_LibretroFceummBridge_nativeShutdown(
    JNIEnv* /*env*/,
    jobject /*thiz*/
) {
    std::lock_guard<std::mutex> lock(g_coreMutex);
    shutdownLocked();
}

} // extern "C"
