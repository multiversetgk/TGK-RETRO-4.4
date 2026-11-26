cmake_minimum_required(VERSION 3.22.1)
project(tgk_nes_bridge LANGUAGES CXX)

add_library(
    tgk_nes_bridge
    SHARED
    libretro_fceumm_bridge.cpp
)

target_include_directories(
    tgk_nes_bridge
    PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
)

find_library(log-lib log)
find_library(android-lib android)

target_link_libraries(
    tgk_nes_bridge
    ${log-lib}
    ${android-lib}
    dl
)
