// global variable (initialized in setup) which tracks websocket connection to
// server. used to broadcast / receive events to and from server.
var socket;
var redraw = false;
// global variables to store the color picker and offset states
var paintColorPicker;
var backgroundColorPicker;
var brushColorLeft=[170,0,0,255], brushColorRight=[170,0,0,255]
var labelColorLeft=[170,0,0,255], labelColorRight=[170,0,0,255]

var paintStrokeBuffer = [];

// global variables tracking the color values.
let ir = 246, ig = 255, igp = 0, ib = 68;
let bg = [40,40,40]
let bg_left = [255, 0, 255]
let bg_right = [255, 255, 0]
// internal mapping to overwrite default p5.js APIs.
// key = p5.js original API name (e.g. "fill", "stroke" etc), value = custom functions.
let d = {};

//color picker related
var colorWheelSize = 200, margin = 30, colorWheel;

// for keming's color pickers
var paintHColors = [[[167, 88, 65], [120, 40, 9]], [[235, 181, 156], [202, 113, 76]], [[52, 88, 111], [45, 128, 156]], [[138, 169, 131], [110, 169, 126]]]
var paintRColors = [[179, 200, 90], [94, 62, 239], [219, 196, 11], [164, 28, 159]]

var backgroundHColors = [[[167, 88, 65], [120, 40, 9]], [[235, 181, 156], [202, 113, 76]], [[52, 88, 111], [45, 128, 156]], [[138, 169, 131], [110, 169, 126]]]
var backgroundRColors = [[179, 200, 90], [94, 62, 239], [219, 196, 11], [164, 28, 159]]

var curr_offset;
var next_offset;
var curr_height;
var next_height;


/************************
 *                      *
 *    p5.js callbacks   *
 *                      *
 ************************/
 function preload() {
	colorWheel = loadImage("ColorWheel.png");
}

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
  createCanvas(window.innerWidth, window.innerHeight);
  
  
  // initialize paint areas and some UI components
  fillD(width/2);
  colorWheelSize = width/10;
  initialization();
  createResetButton()
  createLoadButton()

  // specify the offset, height
  curr_offset = width/2;
  curr_height = height;

  // initialize next_offset and next_height 
  next_offset = curr_offset;
  next_height = curr_height;

}

// p5.js will then repeatedly call this function to render drawings.
function draw() {
  
  if (next_offset !== curr_offset || next_height !== curr_height || redraw) {
    // this is called when the window size changes, which then changes the offset.

    // need to remove old elements like the buttons, lines, background area, etc.
    // otherwise, the new elements just get repeatedly drawn over old ones, and images don't have their resolutions/etc updated.
    clear();

    //update the drawing functions
    fillD(next_offset);
    

    // redraw the relevant elements based on the new fillD function
    stroke(255)
    line(d.width,0,d.width,d.height)

    //colorWheel = loadImage("ColorWheel.png"); <- tiny issue with this; need to reload, or else the repeated colorwheel.resize calls will make 
    // this blurry, but the loadImage happens too slowly relative to drawing so p5 js gets confused and doesn't show the colorwheel
    reinitialization();
    createResetButton();
    createLoadButton();
    
    curr_offset = next_offset;
    curr_height = next_height;

    redraw = false;
  }

  colorWheelSize = width/10;
  ColorPicker(colorWheel, colorWheelSize, bg, margin, d, socket, mouseIsPressed, mouseX, mouseY, pmouseX, pmouseY)
  paintColorPicker = new ColorPickerKeming(width, height, curr_offset, paintHColors, paintRColors, "Paint", "lowerleft");
  backgroundColorPicker = new ColorPickerKeming(width, height, curr_offset, backgroundHColors, backgroundRColors, "Background", "lowerright");

  paintColorPicker.display(d);
  backgroundColorPicker.display(d);
}

function mousePressed() {
  pc = paintColorPicker.retColorClicked();
  bc = backgroundColorPicker.retColorClicked();
  if (pc) {
    brushColorLeft = pc[0];
    labelColorLeft = pc[0];
    brushColorRight = pc[1];
    labelColorRight = pc[1];
    // as user changes brush color, we need to synchronize this change to other
    // clients too.
		payload = {
			type: "brush_color_change_left",
			payload: pc[0],
		}
    socket.send(JSON.stringify(payload));
    payload = {
			type: "brush_color_change_right",
			payload: pc[1],
		}
    socket.send(JSON.stringify(payload));
  }
  if (bc) {
    // TODO: synchronize this to other clients via ws.
    // TODO: update the left and right background colors correspondignly
    bg_left = bc[0];
    bg_right = bc[1];
    initialization();
    // after reinitializing, need to repaint the items that have already been painted
    console.log('client-side redo')
    repaintBufferItems();

    // as user changes bg color, we need to synchronize this change to other
    // clients too.
		payload = {
			type: "background_color_change",
			payload: bc,
		}
    socket.send(JSON.stringify(payload));


    // when user changes bg color, need to redraw the recorded paintbrushstrokes. 


  }
}


function windowResized() {
  // first update canvas to match size of window
  resizeCanvas(window.innerWidth, window.innerHeight);
  // update the new offset; the draw() function uses the curr_offset to update the D function and redo drawings automatically
  next_offset = width/2;
  next_height = height;
  
  // send a message to the web socket indicating that we are resetting the canvas and to redraw components on other clients
  // this part is dubious whether it works...
  let rendering_info = {
    canvas_width:width,
    canvas_height:height,
    offset:next_offset,
  }

  socket.send(JSON.stringify({type:"canvas_resize", payload:rendering_info}));
  
}

/************************
 *                      *
 *    custom handlers   *
 *                      *
 ************************/



// Core function which overwrites and extends default p5.js functions such as
// fill, stroke, etc.
function fillD(offset) {
  // overwrite fill and stroke functions with d.fill and d.stroke such that they take in
  // RGG'B  and render rgb on left eye and rg'b on right eye.
  ["fill", "stroke"].forEach(fn => {
    d[fn] = (r1,g1,b1,r2,g2,b2) => {
      d[`${fn}_left`] = color(r1,g1,b1);
      d[`${fn}_right`] = color(r2,g2,b2);
    }
  });
  d["noStroke"] = ()=>{
      d["stroke_left"] = 0;
      d["stroke_right"] = 0;
  }
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
      
      let newargs = Array.from(arguments).map((v, i) => ((2 ** i) & idxs) > 0 ? v + offset : v);
      OG_f.apply(window, newargs);
    }
  });

  d.width = offset;
  d.height = height;
}

// FOR USE IN REPAINTING THE STROKE ITEMS AFTER adjusting the background, resizing the canvas, or changing the offset
function repaintBufferItems() {
  console.log(paintStrokeBuffer.length);
  for (let i = 0; i < paintStrokeBuffer.length; i++) {
    let action = paintStrokeBuffer[i].type;
    let pl = paintStrokeBuffer[i].payload;
    paintbrushStroke(pl[0],pl[1],pl[2],pl[3],pl[4],pl[5]);
    
  }
}


/************************
 *                      *
 *   websocket helpers  *
 *                      *
 ************************/

// Takes a JSON string with 2 keys (type, payload). Will process them
// differently based on the type.
function handleMessage(msg) {
  obj = JSON.parse(msg);
  switch (obj.type) {
    case "draw_stroke":
      pl = obj.payload
      paintStrokeBuffer.push({type: 'draw_stroke', payload: pl});
      paintbrushStroke(pl[0],pl[1],pl[2],pl[3],pl[4],pl[5]);
      console.log('added stroke');
      break;
    case "reset_canvas":
      redraw = true;
      paintStrokeBuffer = [];
      break;
    case "brush_color_change_left":
      brushColorLeft = obj.payload;
      labelColorLeft = obj.payload;
      break;
    case "brush_color_change_right":
      brushColorRight = obj.payload;
      labelColorRight = obj.payload;
      break;
    case "background_color_change":
      bg_left = obj.payload[0];
      bg_right = obj.payload[1];
      console.log('bgchange')
      initialization();
      // repaint all items in buffer, since the background color change overwrites the previously drawn items
      repaintBufferItems();
      break;
    case "set_background_picture":
      displayImg(obj.payload);
      break;
    // add more cases here for other synchronization needs
    case "canvas_resize":
      // console.log('got resize');
      // // reset the D functions; this will cause the color picker elems to automatically redraw too
      // fillD(obj.payload['offset']);
      // // set the new canvas size using obj.payload['canvas_width'] and obj.payload['canvas_height']
      // resizeCanvas()
      // // redraw UI elements like the drawing area, etc, which will use the new screenwidth and such
      // redraw=true;
      // repaintBufferItems();
      break;
    case "change_offset":
      break;
      
    default:
      return
  }
}