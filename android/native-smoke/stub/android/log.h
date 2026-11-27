#pragma once
#include <cstdio>
#include <cstdarg>
#define ANDROID_LOG_DEBUG 3
#define ANDROID_LOG_INFO 4
#define ANDROID_LOG_WARN 5
#define ANDROID_LOG_ERROR 6
inline int __android_log_print(int p, const char* t, const char* f, ...) { va_list a; va_start(a,f); printf("[%d %s] ",p,t); vprintf(f,a); printf("\n"); va_end(a); return 0; }
inline int __android_log_vprint(int p, const char* t, const char* f, va_list a) { printf("[%d %s] ",p,t); vprintf(f,a); printf("\n"); return 0; }
