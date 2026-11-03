// Used only by the single-file build: three.js is loaded from cdnjs as a <script> (window.THREE).
// The Vite project imports the real 'three' npm package instead.
module.exports = window.THREE;
