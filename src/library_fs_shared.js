/**
 * @license
 * Copyright 2032 The Emscripten Authors
 * SPDX-License-Identifier: MIT
 */

mergeInto(LibraryManager.library, {
  $preloadPlugins: "{{{ makeModuleReceiveExpr('preloadPlugins', '[]') }}}",

#if !MINIMAL_RUNTIME
  // Tries to handle an input byteArray using preload plugins. Returns true if
  // it was handled.
  $FS_handledByPreloadPlugin__internal: true,
  $FS_handledByPreloadPlugin__deps: ['$preloadPlugins'],
  $FS_handledByPreloadPlugin: function(byteArray, fullname, finish, onerror) {
#if LibraryManager.has('library_browser.js')
    // Ensure plugins are ready.
    if (typeof Browser != 'undefined') Browser.init();
#endif

    var handled = false;
    preloadPlugins.forEach(function(plugin) {
      if (handled) return;
      if (plugin['canHandle'](fullname)) {
        plugin['handle'](byteArray, fullname, finish, onerror);
        handled = true;
      }
    });
    return handled;
  },
#endif

  // Preloads a file asynchronously. You can call this before run, for example in
  // preRun. run will be delayed until this file arrives and is set up.
  // If you call it after run(), you may want to pause the main loop until it
  // completes, if so, you can use the onload parameter to be notified when
  // that happens.
  // In addition to normally creating the file, we also asynchronously preload
  // the browser-friendly versions of it: For an image, we preload an Image
  // element and for an audio, and Audio. These are necessary for SDL_Image
  // and _Mixer to find the files in preloadedImages/Audios.
  // You can also call this with a typed array instead of a url. It will then
  // do preloading for the Image/Audio part, as if the typed array were the
  // result of an XHR that you did manually.
  $FS_createPreloadedFile__deps: ['$asyncLoad',
#if !MINIMAL_RUNTIME
    '$FS_handledByPreloadPlugin',
#endif
  ],
  $FS_createPreloadedFile: function(parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) {
#if WASMFS
    // TODO: use WasmFS code to resolve and join the path here?
    var fullname = name ? parent + '/' + name : parent;
#else
    // TODO we should allow people to just pass in a complete filename instead
    // of parent and name being that we just join them anyways
    var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
#endif
    var dep = getUniqueRunDependency(`cp ${fullname}`); // might have several active requests for the same fullname
    function processData(byteArray) {
      function finish(byteArray) {
        if (preFinish) preFinish();
        if (!dontCreateFile) {
          FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
        }
        if (onload) onload();
        removeRunDependency(dep);
      }
#if !MINIMAL_RUNTIME
      if (FS_handledByPreloadPlugin(byteArray, fullname, finish, () => {
        if (onerror) onerror();
        removeRunDependency(dep);
      })) {
        return;
      }
#endif
      finish(byteArray);
    }
    addRunDependency(dep);
    if (typeof url == 'string') {
      asyncLoad(url, (byteArray) => processData(byteArray), onerror);
    } else {
      processData(url);
    }
  },
  // convert the 'r', 'r+', etc. to it's corresponding set of O_* flags
  $FS_modeStringToFlags: function(str) {
    var flagModes = {
      'r': {{{ cDefs.O_RDONLY }}},
      'r+': {{{ cDefs.O_RDWR }}},
      'w': {{{ cDefs.O_TRUNC }}} | {{{ cDefs.O_CREAT }}} | {{{ cDefs.O_WRONLY }}},
      'w+': {{{ cDefs.O_TRUNC }}} | {{{ cDefs.O_CREAT }}} | {{{ cDefs.O_RDWR }}},
      'a': {{{ cDefs.O_APPEND }}} | {{{ cDefs.O_CREAT }}} | {{{ cDefs.O_WRONLY }}},
      'a+': {{{ cDefs.O_APPEND }}} | {{{ cDefs.O_CREAT }}} | {{{ cDefs.O_RDWR }}},
    };
    var flags = flagModes[str];
    if (typeof flags == 'undefined') {
      throw new Error(`Unknown file open mode: ${str}`);
    }
    return flags;
  },
  $FS_getMode: function(canRead, canWrite) {
    var mode = 0;
    if (canRead) mode |= {{{ cDefs.S_IRUGO }}} | {{{ cDefs.S_IXUGO }}};
    if (canWrite) mode |= {{{ cDefs.S_IWUGO }}};
    return mode;
  },

});
