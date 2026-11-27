// Host smoke test for the JNI bridge's libretro host code.
// Includes the REAL bridge source so the same environment/video/audio/input callbacks are used,
// then loads a ROM the way LibretroFceummBridge does (by real file path) and runs 60 frames.
//
// Regression guard: libretro-fceumm has need_fullpath=true and refuses a bare display name
// ("Error opening <name>!"), which made every ROM show "Invalid iNES cartridge" on device.
#include "libretro_fceumm_bridge.cpp"
#include <fstream>
#include <iterator>

static bool bind(void* h) {
    return loadSymbol(h, "retro_init", g_core.retro_init) && loadSymbol(h, "retro_deinit", g_core.retro_deinit) &&
        loadSymbol(h, "retro_get_system_info", g_core.retro_get_system_info) &&
        loadSymbol(h, "retro_get_system_av_info", g_core.retro_get_system_av_info) &&
        loadSymbol(h, "retro_set_environment", g_core.retro_set_environment) &&
        loadSymbol(h, "retro_set_video_refresh", g_core.retro_set_video_refresh) &&
        loadSymbol(h, "retro_set_audio_sample", g_core.retro_set_audio_sample) &&
        loadSymbol(h, "retro_set_audio_sample_batch", g_core.retro_set_audio_sample_batch) &&
        loadSymbol(h, "retro_set_input_poll", g_core.retro_set_input_poll) &&
        loadSymbol(h, "retro_set_input_state", g_core.retro_set_input_state) &&
        loadSymbol(h, "retro_set_controller_port_device", g_core.retro_set_controller_port_device) &&
        loadSymbol(h, "retro_run", g_core.retro_run) && loadSymbol(h, "retro_load_game", g_core.retro_load_game) &&
        loadSymbol(h, "retro_unload_game", g_core.retro_unload_game) &&
        loadSymbol(h, "retro_serialize_size", g_core.retro_serialize_size) &&
        loadSymbol(h, "retro_serialize", g_core.retro_serialize) &&
        loadSymbol(h, "retro_unserialize", g_core.retro_unserialize);
}

int main(int argc, char** argv) {
    if (argc < 3) { printf("usage: smoke <core.so> <rom.nes>\n"); return 2; }
    void* h = dlopen(argv[1], RTLD_LAZY);
    if (!h) { printf("FAIL dlopen: %s\n", dlerror()); return 2; }
    g_core.handle = h;
    if (!bind(h)) { printf("FAIL missing libretro symbols\n"); return 2; }
    g_core.retro_set_environment(environmentCallback);
    g_core.retro_set_video_refresh(videoRefreshCallback);
    g_core.retro_set_audio_sample(audioSampleCallback);
    g_core.retro_set_audio_sample_batch(audioSampleBatchCallback);
    g_core.retro_set_input_poll(inputPollCallback);
    g_core.retro_set_input_state(inputStateCallback);
    g_core.retro_init();

    std::ifstream f(argv[2], std::ios::binary);
    std::vector<uint8_t> rom((std::istreambuf_iterator<char>(f)), {});
    if (rom.size() < 16) { printf("FAIL cannot read ROM\n"); return 2; }

    // Info only: a bare display name that is not a file. Documents the upstream requirement.
    {
        retro_game_info gi{}; gi.path = "DisplayNameOnly.nes"; gi.data = rom.data(); gi.size = rom.size();
        bool ok = g_core.retro_load_game(&gi);
        printf("INFO name-only path load => %d (0 expected: core needs a real file path)\n", ok);
        if (ok) g_core.retro_unload_game();
    }

    // Required: real file path (what LibretroFceummBridge.writeRomToCache provides).
    g_romData = rom; g_romPath = argv[2];
    retro_game_info gi{}; gi.path = g_romPath.c_str(); gi.data = g_romData.data(); gi.size = g_romData.size();
    if (!g_core.retro_load_game(&gi)) { printf("FAIL real-path load returned false\n"); return 1; }
    g_core.retro_set_controller_port_device(0, RETRO_DEVICE_JOYPAD);
    g_core.retro_set_controller_port_device(1, RETRO_DEVICE_JOYPAD);
    g_gameLoaded = true;

    int frames = 0;
    for (int i = 0; i < 60; ++i) { g_hasNewFrame = false; g_core.retro_run(); frames += g_hasNewFrame ? 1 : 0; }
    size_t sz = g_core.retro_serialize_size();
    std::vector<uint8_t> state(sz);
    bool ser = sz > 0 && g_core.retro_serialize(state.data(), sz) && g_core.retro_unserialize(state.data(), sz);
    printf("frames with video: %d/60, serialize=%zu bytes roundtrip=%d, fps=%.3f\n", frames, sz, ser, g_fps);
    if (frames < 55) { printf("FAIL too few video frames\n"); return 1; }
    if (!ser) { printf("FAIL save-state roundtrip\n"); return 1; }
    printf("PASS\n");
    return 0;
}
