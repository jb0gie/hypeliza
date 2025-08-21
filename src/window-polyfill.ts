// Minimal polyfill for PGLite and Hyperfy to prevent browser API errors in Node.js
if (typeof global !== 'undefined' && typeof window === 'undefined') {
  // Make global available to window
  (global as any).global = global;
  
  // Create a mock FileReader for WebAssembly
  class MockFileReader {
    result: any = null;
    error: any = null;
    readyState: number = 0;
    onload: any = null;
    onerror: any = null;
    
    readAsArrayBuffer(blob: any) {
      this.readyState = 2;
      if (blob && blob.arrayBuffer) {
        blob.arrayBuffer().then((buffer: any) => {
          this.result = buffer;
          if (this.onload) this.onload({ target: this });
        }).catch((err: any) => {
          this.error = err;
          if (this.onerror) this.onerror({ target: this });
        });
      } else {
        this.result = new ArrayBuffer(0);
        if (this.onload) this.onload({ target: this });
      }
    }
  }
  
  (global as any).window = {
    location: {
      pathname: '/',
      href: 'http://localhost:3000/',
      origin: 'http://localhost:3000',
      protocol: 'http:',
      host: 'localhost:3000',
      hostname: 'localhost',
      port: '3000',
      search: '',
      hash: ''
    },
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    addEventListener: () => {},
    removeEventListener: () => {},
    FileReader: MockFileReader,
    Blob: typeof Blob !== 'undefined' ? Blob : class MockBlob {
      constructor(parts?: any[], options?: any) {}
      arrayBuffer() { return Promise.resolve(new ArrayBuffer(0)); }
    },
    matchMedia: () => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    }),
    navigator: {
      userAgent: 'Node.js',
      platform: 'Node.js',
      onLine: true
    },
    document: {
      createElement: (tag: string) => ({
        tagName: tag,
        style: {},
        setAttribute: () => {},
        getAttribute: () => null,
        appendChild: () => {},
        removeChild: () => {}
      }),
      body: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      location: {
        toString: () => 'http://localhost:3000/',
        href: 'http://localhost:3000/',
        origin: 'http://localhost:3000',
        protocol: 'http:',
        host: 'localhost:3000',
        hostname: 'localhost',
        port: '3000',
        pathname: '/',
        search: '',
        hash: ''
      }
    },
    performance: typeof performance !== 'undefined' ? performance : {
      now: () => Date.now()
    },
    WebAssembly: typeof WebAssembly !== 'undefined' ? WebAssembly : undefined,
    crypto: typeof crypto !== 'undefined' ? crypto : {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      }
    }
  };
  
  // Also make window available on global for compatibility
  (global as any).self = global;
  (global as any).FileReader = MockFileReader;
  
  // Add localStorage polyfill
  (global as any).localStorage = {
    data: {},
    getItem(key: string) { return this.data[key] || null; },
    setItem(key: string, value: string) { this.data[key] = value; },
    removeItem(key: string) { delete this.data[key]; },
    clear() { this.data = {}; },
    key(index: number) { return Object.keys(this.data)[index] || null; },
    get length() { return Object.keys(this.data).length; }
  };
  
  // Add WebAssembly polyfills for PGLite
  if (typeof WebAssembly !== 'undefined') {
    const originalInstantiate = WebAssembly.instantiate;
    const originalInstantiateStreaming = WebAssembly.instantiateStreaming;
    
    // Wrap instantiate to handle errors more gracefully
    WebAssembly.instantiate = async function(...args: any[]) {
      try {
        return await originalInstantiate.apply(this, args);
      } catch (error) {
        console.warn('WebAssembly.instantiate error, attempting fallback:', error);
        throw error;
      }
    };
    
    // Add instantiateStreaming if missing
    if (!WebAssembly.instantiateStreaming) {
      WebAssembly.instantiateStreaming = async function(source: any, importObject?: any) {
        const response = await source;
        const buffer = await response.arrayBuffer();
        return WebAssembly.instantiate(buffer, importObject);
      };
    }
  }
  
  // Add process.versions.node if missing (for PGLite detection)
  if (typeof process !== 'undefined' && (!process.versions || !process.versions.node)) {
    if (!process.versions) process.versions = {};
    process.versions.node = '20.0.0';
  }
}

export {};