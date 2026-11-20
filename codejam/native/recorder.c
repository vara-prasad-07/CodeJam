/* CodeJam's local-only microphone helper. JSON lines on stdout; stop on stdin/EOF.
 * Audio never leaves this process except through the caller-owned WAV file.
 * miniaudio 0.11.24 is distributed under its MIT No Attribution option.
 */
#define MA_NO_DECODING
#define MA_NO_ENGINE
#define MA_NO_RESOURCE_MANAGER
#define MA_NO_NODE_GRAPH
#define MA_NO_GENERATION
#include "vendor/miniaudio.c"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include <windows.h>
#include <shellapi.h>
#ifdef _MSC_VER
#pragma comment(lib, "shell32.lib")
#endif
#else
#include <poll.h>
#include <unistd.h>
#endif

#define RATE 16000
#define LIMIT_FRAMES (RATE * 60)
typedef struct { ma_encoder encoder; ma_mutex lock; ma_uint64 frames; float level; int write_failed; } capture;

static void json_string(const char* value) {
 const unsigned char* p = (const unsigned char*)value;
 putchar('"');
 for (; *p; ++p) {
  if (*p == '"' || *p == '\\') { putchar('\\'); putchar(*p); }
  else if (*p < 32) { printf("\\u%04x", *p); }
  else { putchar(*p); }
 }
 putchar('"');
}
static int error(const char* message) {
 printf("{\"type\":\"error\",\"message\":"); json_string(message); puts("}"); fflush(stdout); return 1;
}
static void on_audio(ma_device* device, void* output, const void* input, ma_uint32 count) {
 capture* state = (capture*)device->pUserData;
 ma_uint32 i; int peak = 0; ma_uint64 written = 0;
 if (!input) { return; }
 ma_mutex_lock(&state->lock);
 if (state->frames >= LIMIT_FRAMES) { ma_mutex_unlock(&state->lock); return; }
 if (count > LIMIT_FRAMES - state->frames) { count = (ma_uint32)(LIMIT_FRAMES - state->frames); }
 for (i = 0; i < count; ++i) {
  int sample = ((const ma_int16*)input)[i]; if (sample < 0) { sample = -sample; }
  if (sample > peak) { peak = sample; }
 }
 if (ma_encoder_write_pcm_frames(&state->encoder, input, count, &written) != MA_SUCCESS || written != count) { state->write_failed = 1; }
 state->frames += written; state->level = (float)peak / 32768.0f;
 ma_mutex_unlock(&state->lock);
 (void)output;
}
static int should_stop(void) {
#ifdef _WIN32
 DWORD available = 0; HANDLE handle = GetStdHandle(STD_INPUT_HANDLE);
 if (!PeekNamedPipe(handle, NULL, 0, NULL, &available, NULL)) { return 2; }
 if (available) { char buffer[32]; DWORD read = 0; ReadFile(handle, buffer, sizeof(buffer), &read, NULL); return 1; }
 Sleep(50);
#else
 struct pollfd input = { STDIN_FILENO, POLLIN | POLLHUP, 0 };
 if (poll(&input, 1, 50) > 0) { char command; return read(STDIN_FILENO,&command,1) == 1 ? 1 : 2; }
#endif
 return 0;
}
static int run(int argc, char** argv) {
 ma_context context; ma_device_info* devices; ma_uint32 count = 0, i;
 ma_device device; ma_device_config config; ma_encoder_config encoder_config;
 capture state; double duration = 0; int failed = 0, index = -1, stop_reason = 0;
 setvbuf(stdout, NULL, _IOLBF, 0);
 if (argc == 2 && strcmp(argv[1], "--version") == 0) { puts("CodeJam recorder 1 (miniaudio 0.11.24)"); return 0; }
 if (ma_context_init(NULL, 0, NULL, &context) != MA_SUCCESS) { return error("Cannot initialize audio. Check microphone permissions and your audio service."); }
 if (ma_context_get_devices(&context, NULL, NULL, &devices, &count) != MA_SUCCESS) { ma_context_uninit(&context); return error("Cannot list microphone devices."); }
 if (argc == 2 && strcmp(argv[1], "--list") == 0) {
  printf("{\"type\":\"devices\",\"devices\":[");
  for (i = 0; i < count; ++i) { if (i) { putchar(','); } printf("{\"id\":%u,\"name\":", i); json_string(devices[i].name); printf(",\"isDefault\":%s}", devices[i].isDefault ? "true" : "false"); }
  puts("]}"); ma_context_uninit(&context); return 0;
 }
 if (argc != 4 || strcmp(argv[1], "--record") != 0) { ma_context_uninit(&context); return error("Invalid recorder arguments."); }
 index = atoi(argv[3]);
 if (!count || index < -1 || index >= (int)count) { ma_context_uninit(&context); return error("Selected microphone is unavailable. Choose another microphone."); }
 memset(&state, 0, sizeof(state));
 encoder_config = ma_encoder_config_init(ma_encoding_format_wav, ma_format_s16, 1, RATE);
 if (ma_encoder_init_file(argv[2], &encoder_config, &state.encoder) != MA_SUCCESS) { ma_context_uninit(&context); return error("Cannot create a temporary voice recording."); }
 if (ma_mutex_init(&state.lock) != MA_SUCCESS) { ma_encoder_uninit(&state.encoder); ma_context_uninit(&context); return error("Cannot initialize recorder synchronization."); }
 config = ma_device_config_init(ma_device_type_capture);
 config.capture.format = ma_format_s16; config.capture.channels = 1; config.sampleRate = RATE;
 config.dataCallback = on_audio; config.pUserData = &state;
 if (index >= 0) { config.capture.pDeviceID = &devices[index].id; }
 if (ma_device_init(&context, &config, &device) != MA_SUCCESS) { ma_mutex_uninit(&state.lock); ma_encoder_uninit(&state.encoder); ma_context_uninit(&context); return error("Cannot open the microphone. Check system microphone permission or select another device."); }
 if (ma_device_start(&device) != MA_SUCCESS) { ma_device_uninit(&device); ma_mutex_uninit(&state.lock); ma_encoder_uninit(&state.encoder); ma_context_uninit(&context); return error("Cannot start the microphone. It may be unavailable or in use by another application."); }
 puts("{\"type\":\"ready\"}"); fflush(stdout);
 while ((stop_reason = should_stop()) == 0) {
  ma_uint64 frames; float level;
  ma_mutex_lock(&state.lock);
  frames = state.frames; level = state.level; failed = state.write_failed;
  ma_mutex_unlock(&state.lock);
  printf("{\"type\":\"progress\",\"duration\":%.3f,\"level\":%.4f}\n", (double)frames / RATE, level); fflush(stdout);
  if (frames >= LIMIT_FRAMES || failed || !ma_device_is_started(&device)) { break; }
 }
 ma_device_uninit(&device);
 duration = (double)state.frames / RATE; failed = state.write_failed;
 ma_mutex_uninit(&state.lock); ma_encoder_uninit(&state.encoder); ma_context_uninit(&context);
 if (stop_reason == 2) { remove(argv[2]); return 0; }
 if (failed) { return error("The recording could not be saved. Check available disk space and try again."); }
 printf("{\"type\":\"complete\",\"duration\":%.3f}\n", duration); fflush(stdout);
 return 0;
}
int main(int argc, char** argv) {
#ifdef _WIN32
 /* Windows supplies UTF-16 paths; miniaudio expects UTF-8, including Unicode user directories. */
 int count = 0, i, result; LPWSTR* wide = CommandLineToArgvW(GetCommandLineW(), &count);
 char** utf8;
 (void)argc; (void)argv;
 if (!wide) { return error("Cannot read recorder arguments."); }
 utf8 = (char**)calloc((size_t)count, sizeof(char*));
 if (!utf8) { LocalFree(wide); return error("Cannot allocate recorder arguments."); }
 for (i = 0; i < count; ++i) {
  int length = WideCharToMultiByte(CP_UTF8,0,wide[i],-1,NULL,0,NULL,NULL);
  utf8[i] = (char*)malloc((size_t)length);
  if (!utf8[i]) { while (i > 0) { free(utf8[--i]); } free(utf8); LocalFree(wide); return error("Cannot allocate recorder arguments."); }
  WideCharToMultiByte(CP_UTF8,0,wide[i],-1,utf8[i],length,NULL,NULL);
 }
 result = run(count,utf8);
 for (i = 0; i < count; ++i) { free(utf8[i]); }
 free(utf8); LocalFree(wide); return result;
#else
 return run(argc,argv);
#endif
}
