// global variable (initialized in setup) which tracks websocket connection to
// server. used to broadcast / receive events to and from server.
var socket;

// global variables tracking the color values.
let ir = 246, ig = 255, igp = 0, ib = 68;

// internal mapping to overwrite default p5.js APIs.
// key = p5.js original API name (e.g. "fill", "stroke" etc), value = custom functions.
let d = {};

/************************
 *                      *
 *    p5.js callbacks   *
 *                      *
 ************************/

 // p5.js will first call this function upon starting.
function setup() {

  // Start by creating a websocket connection to the server to push and receive
  // canvas updates.
  socket = new WebSocket(`ws://${window.location.host}/comm`);
    
  // when the socket closes, issue an alert.
  socket.addEventListener('close', () => {
    alert("Socket connection to server closed.");
  });

  // when there's a message from the server, use the handleMessage function
  // to handle it.
  socket.addEventListener('message', message => {
    handleMessage(message.data);
  })  

  // Initialize the canvas to the size of the screen.
  createCanvas(window.innerWidth, window.innerHeight+100);

  fillD();
}

// p5.js will then repeatedly call this function to render drawings.
function draw() {
  paintbrushStroke();
}
/************************
 *                      *
 *    custom handlers   *
 *                      *
 ************************/

 // Used to draw paintbrush strokes across the canvas.
function paintbrushStroke() {
  colorMode(RGB);
  if(mouseIsPressed){
     noStroke();
     // Change the RGB parameters here using a color picker.
     d.stroke(ir, ig, igp, ib);
     strokeWeight(35);
     d.line(mouseX, mouseY, pmouseX, pmouseY);
   }
}


// Core function which overwrites and extends default p5.js functions such as
// fill, stroke, etc.
function fillD() {
  // overwrite fill and stroke functions with d.fill and d.stroke such that they take in
  // RGG'B  and render rgb on left eye and rg'b on right eye.
  ["fill", "stroke"].forEach(fn => {
    d[fn] = (r,g,gp,b) => {
      d[`${fn}_left`] = color(r,g,b);
      d[`${fn}_right`] = color(r,gp,b);
    }
  });
  // overwrite the p5.js APIs for drawing shapes / figures so that they take up
  // half the width, so the same image is shown on left and right side of canvas.
  // bitfield of indices that need to have "width/2" added
  [["ellipse", 0b1], ["rect", 0b1], ["text", 0b10], ["line", 0b0101]].forEach(([fn, idxs]) => {
    d[fn] = function() {
      let OG_f = window[fn];
      // we fill the left side with the rgb color
      if (d.fill_left) {
        fill(d.fill_left);
      } else {
        noFill();
      }
      // same for strokes, stroke left side with rgb
      if (d.stroke_left) {
        stroke(d.stroke_left);
      } else {
        noStroke();
      }
    
      OG_f.apply(window, Array.from(arguments));
      // for right side, we fill with rg'b
      if (d.fill_right) {
        fill(d.fill_right);
      } else {
        noFill();
      }
      // same for right side, we stroke with rg'b
      if (d.stroke_right) {
        stroke(d.stroke_right);
      } else {
        noStroke();
      }
      
      let newargs = Array.from(arguments).map((v, i) => ((2 ** i) & idxs) > 0 ? v + width/2 : v);
      OG_f.apply(window, newargs);
    }
  });

  d.width = width/2;
  d.height = height;
}



/************************
 *                      *
 *   websocket helpers  *
 *                      *
 ************************/

function handleMessage(msg) {
  [ir,ig,igp,ib] = msg.split(",").map(s => Number(s.trim())).slice(0, 4);
}