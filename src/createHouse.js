/*
    -------ШЕЙДЕРЫ-------
*/
const VSHADER =
    'attribute vec4 a_Position; \n' +
    'attribute vec4 a_Color;\n' +
    'attribute vec4 a_Normal;\n' +
    'attribute float a_Vertex;\n' +

    'uniform mat4 u_MvpMatrix;\n' +
    'uniform mat4 u_ModelMatrix;\n' +
    'uniform mat4 u_NormalMatrix;\n' +
    'uniform int u_PickedVertex;\n' +
    'uniform bool u_PointsMode;\n' +

    'varying vec4 v_Color;\n' +
    'varying vec3 v_Normal;\n' +
    'varying vec3 v_Position;\n' +
    'varying float v_Pick;\n' +

    'void main() { \n' +
    '  gl_Position = u_MvpMatrix * a_Position;\n' +
    '  v_Position = vec3(u_ModelMatrix * a_Position);\n' +
    '  v_Normal = normalize(vec3(u_NormalMatrix * a_Normal));\n' +
    '  int vertex = int(a_Vertex);\n' +
    '  vec3 color = (vertex == u_PickedVertex && u_PointsMode) ? vec3(1.0, 0.0, 0.0) : a_Color.rgb;\n' +
    '  if (u_PickedVertex == 0) {\n' +
    '    v_Color = vec4(color, a_Vertex/255.0);\n' +
    '  } else {\n' +
    '    v_Color = vec4(color, 1.0);\n' +
    '  }\n' +
    '  if (u_PointsMode) {\n' +
    '    v_Pick=1.0;\n' +
    '  } else {\n' +
    '    v_Pick=0.0;\n' +
    '  }\n' +
    '  gl_PointSize = 10.0;\n' +
    '}\n';


const FSHADER =
    'precision mediump float; \n' +
    'uniform vec3 u_LightColor;\n' +
    'uniform vec3 u_LightPosition;\n' +
    'uniform vec3 u_AmbientLight;\n' +

    'varying vec4 v_Color;\n' +
    'varying vec3 v_Normal;\n' +
    'varying vec3 v_Position;\n' +
    'varying float v_Pick;\n' +

    'void main() {\n' +
    '  if (v_Pick==1.0) {\n' +
    '      gl_FragColor=v_Color;\n' +
    '  } else {\n' +
    '      vec3 normal = normalize(v_Normal);\n' +
    '      vec3 lightDirection = normalize(u_LightPosition - v_Position);\n' +
    // '      float nDotL = max(dot(lightDirection, normal), 0.0);\n' + 
    '      float nDotL = abs(dot(lightDirection, normal));\n' + //правильное освещение задних граней
    '      vec3 diffuse = u_LightColor * v_Color.rgb * nDotL;\n' +
    '      vec3 ambient = u_AmbientLight * v_Color.rgb;\n' +
    '      gl_FragColor = vec4(diffuse + ambient, v_Color.a);\n' +
    '  }\n' +
    '} \n';

/*
    -------ГЛОБАВЛЬНЫЕ ПЕРЕМЕННЫЕ-------
*/

const canvas = document.createElement('canvas');
const gl = canvas.getContext("webgl", {
    antialias: false
}); //контекст WebGL

let shaderProgram; //программа

// let a_normal;
let u_MvpMatrix;
let u_ModelMatrix;
let u_NormalMatrix;
// let u_LightColor;
// let u_LightDirection;
// let u_AmbientLight;
let u_PickedVertex;
let u_PointsMode;

let viewMode; //режим показа - 2D/3D
let editorMode; //режим работы редактора - если true, то можно выполнять построения, если false - то только просмотр
let editStage;
// let modelingStage; //стадия моделирования
let currentAngle = 0;
let gridMode = false; //режим сетки (+ строим сетку, - не строим)
const viewButtons = document.querySelectorAll(".editor .editor__buttons button"); //кнопки в окне



//-----матрицы для отображения
let modelMatrix = new Matrix4();
let viewMatrix = new Matrix4();
let perspectiveMatrix = new Matrix4();
let mvpMatrix = new Matrix4();
let normalMatrix = new Matrix4();

let colors = [];
let normals = [];
let indices = [];


//заготовленные формы фундамента
let exampleShapes = [
    [-0.5, 0.5,
        0.5, 0.5,
        0.5, -0.5,
        0, -0.5,
        0, 0,
        -0.5, 0,
        -0.5, 0.5
    ],

    [-0.5, 0.7,
        0.5, 0.7,
        0.5, 0.5,
        0.7, 0.5,
        0.7, -0.5,
        0.5, -0.5,
        0.5, -0.7,
        -0.5, -0.7,
        -0.5, -0.5,
        -0.7, -0.5,
        -0.7, 0.5,
        -0.5, 0.5,
        -0.5, 0.7
    ],

    [-0.5, 0.5,
        0.5, 0.5,
        0.5, -0.5,
        -0.5, -0.5,
        -0.5, 0.5
    ],

    // [0.0, 0.0,
    //     0.0, 0.1,
    //     0.1, 0.1,
    //     0.1, 0.0,
    //     0.0, 0.0
    // ],

    [-0.2, 0.8,
        0.2, 0.8,
        0.1, 0.2,
        0.2, 0.1,
        0.8, 0.2,
        0.8, -0.2,
        0.2, -0.1,
        0.1, -0.2,
        0.2, -0.8,
        -0.2, -0.8,
        -0.1, -0.2,
        -0.2, -0.1,
        -0.8, -0.2,
        -0.8, 0.2,
        -0.2, 0.1,
        -0.1, 0.2,
        -0.2, 0.8
    ]
];

//----------иерархия объектов----------
//конструктор объектов
class sceneObject {
    constructor(nameObj) {
        this.name = nameObj;
        this.vertices = [];
        this.innerVertices = [];
        this.height = 0;
        this.color = [0, 0, 0];
        // this.texCoord=[];
        this.translation = [0, 0, 0];
    }
    setParent(parentObj) {
        this.parent = parentObj;
    }
    getUpVertices() {
        let upVertices = [];
        for (let i = 0; i < this.vertices.length; i += 2) {
            upVertices.push(this.vertices[i], this.vertices[i + 1], this.innerVertices[i], this.innerVertices[i + 1]);
        }
        return upVertices;
    }
}

let scene = {}; //объект, в котором будем хранить все элементы сцены (объект хранщий всебе объекты)
//добавляем на сцену объект дом
scene.house = {};


/*--------------------------------------------------------------------*/
window.onload = function () {
    let windowWidth = document.documentElement.clientWidth;
    if (windowWidth < 500) {
        // alert(windowWidth/100);
        canvas.width = Math.floor(windowWidth / 100) * 100;
        canvas.height = Math.floor(windowWidth / 100) * 100;
    } else if (windowWidth > 1200) {
        canvas.width = 600;
        canvas.height = 600;
    } else {
        canvas.width = 450;
        canvas.height = 450;
    }
    document.querySelector('.editor__interact').appendChild(canvas);
    canvas.oncontextmenu = function () {
        return false;
    };

    if (!gl) {
        console.log('WebGl does not work in your browser');
        return;
    }

    initShaders(); //инициализация шейдеров и программы
    initVariables();

    gl.viewportWidth = canvas.width;
    gl.viewportHeight = canvas.height;
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);

    gl.clearColor(1, 1, 1, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.0, 1.0);

    editorMode = false; //активируем режим простоя для редактора (нельзя рисовать)
    editStage = 'basement';
    set2D();
    setStage();
    // drawButtons();
}

/*-------------------------РАБОТА С ШЕЙДЕРАМИ-------------------------------------------*/
function initShaders() {
    //получить шейдеры
    const VS = getShader('vs', VSHADER);
    const FS = getShader('fs', FSHADER);

    //создать программу
    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, VS);
    gl.attachShader(shaderProgram, FS);
    gl.linkProgram(shaderProgram);
    gl.useProgram(shaderProgram);
}

function getShader(type, source) {
    let shader;

    if (type === 'vs') {
        shader = gl.createShader(gl.VERTEX_SHADER);
    } else if (type === 'fs') {
        shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else {
        console.log('Unknown type of shader');
        return;
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return;
    }

    return shader;
}

function initVariables() {
    u_ModelMatrix = gl.getUniformLocation(shaderProgram, 'u_ModelMatrix');
    u_MvpMatrix = gl.getUniformLocation(shaderProgram, 'u_MvpMatrix');
    u_NormalMatrix = gl.getUniformLocation(shaderProgram, 'u_NormalMatrix');

    u_PickedVertex = gl.getUniformLocation(shaderProgram, 'u_PickedVertex');
    u_PointsMode = gl.getUniformLocation(shaderProgram, 'u_PointsMode');

    let u_LightColor = gl.getUniformLocation(shaderProgram, 'u_LightColor'),
        u_LightPosition = gl.getUniformLocation(shaderProgram, 'u_LightPosition'),
        u_AmbientLight = gl.getUniformLocation(shaderProgram, 'u_AmbientLight');

    if (!u_ModelMatrix || !u_MvpMatrix || !u_NormalMatrix || !u_LightColor || !u_LightPosition || !u_AmbientLight) {
        console.log('Failed to get the storage location');
        return;
    }

    gl.uniform3f(u_LightColor, 1.0, 1.0, 1.0);
    gl.uniform3f(u_LightPosition, -2.0, -3.0, 2.0);
    gl.uniform3f(u_AmbientLight, 0.2, 0.2, 0.2);
    gl.uniform1i(u_PickedVertex, -1); //-1 - нет щелчка, 0 - щелчок, 1,2,3,... - номер вершины/объекта
    gl.uniform1i(u_PointsMode, 0); //0 - не точки, 1 - точки
}

function initArrayBuffer(gl, attribute, data, type, num) {
    let buffer = gl.createBuffer();
    if (!buffer) {
        console.log('Failed to create the buffer object');
        return false;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    let a_attribute = gl.getAttribLocation(shaderProgram, attribute);
    if (a_attribute < 0) {
        console.log('Failed to get the storage location of ' + attribute);
        return false;
    }
    gl.vertexAttribPointer(a_attribute, num, type, false, 0, 0);
    gl.enableVertexAttribArray(a_attribute);
    return true;
}

function initAllBuffer(positions, colors, normals, numbers) {
    if (!initArrayBuffer(gl, 'a_Position', new Float32Array(positions), gl.FLOAT, 3)) return -1;
    if (!initArrayBuffer(gl, 'a_Color', new Float32Array(colors), gl.FLOAT, 3)) return -1;
    if (!initArrayBuffer(gl, 'a_Normal', new Float32Array(normals), gl.FLOAT, 3)) return -1;
    if (!initArrayBuffer(gl, 'a_Vertex', new Uint8Array(numbers), gl.UNSIGNED_BYTE, 1)) return -1;
}

function setMatrixUniforms() {
    mvpMatrix.set(perspectiveMatrix);
    mvpMatrix.multiply(viewMatrix);
    mvpMatrix.multiply(modelMatrix);
    gl.uniformMatrix4fv(u_MvpMatrix, false, mvpMatrix.elements);
    gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
    gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);
}
/*-------------------------КОНЕЦ РАБОТА С ШЕЙДЕРАМИ-------------------------------------------*/


/*---------------------------РИСОВАНИЕ ФИГУР-----------------------------------------*/
function draw() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    //оси координат
    let axisArray = [
        0.0, 0.0, 0.0, 1.0, 0.0, 0.0, //x (red)
        0.0, 0.0, 0.0, 0.0, 1.0, 0.0, //y (grey)
        0.0, 0.0, 0.0, 0.0, 0.0, 1.0, //z (green)
    ];

    let count = axisArray.length / 3;
    let colors = [];
    let normals = [];
    for (let i = 0; i < count; i++) {
        colors.push(0.0, 0.0, 0.0);
        normals.push(0.0, 0.0, 0.0);
    }
    let vertexNumber = [];
    for (let i = 0; i < axisArray.length / 3; i++) {
        vertexNumber.push(i + 1);
    }
    initAllBuffer(axisArray, colors, normals, vertexNumber);
    gl.drawArrays(gl.LINES, 0, count);

    modelMatrix.pushMatrix();

    for (obj in scene.house) {
        if (scene.house[obj].translation) {
            let dx = scene.house[obj].translation[0];
            let dy = scene.house[obj].translation[1];
            let dz = scene.house[obj].translation[2];
            modelMatrix.translate(dx, dy, dz);
            setMatrixUniforms();
        }
        if (obj === 'roomWalls') {
            drawRoomWalls(scene.house[obj]);
        } else
        if (viewMode === '2d') {
            if (scene.house[obj].vertices) {
                drawScheme(scene.house[obj].vertices, 0, [0, 0, 0], false);
            } //!!!!!!!!!!!!!!условие повторяется в drawScheme
            if (scene.house[obj].innerVertices && scene.house[obj].innerVertices.length > 0) {
                drawScheme(scene.house[obj].innerVertices, 0, [0, 0, 0], false);
            }
            if (editorMode && obj === editStage) {
                drawPoints(scene.house[obj].vertices);
                // if (obj === editStage) {
                //     // if (obj === 'roomWalls') {
                //     //     for (let i = 1; i <= scene.house.floors; i++) {
                //     //         drawPoints(scene.house.roomWalls[i]);
                //     //     }
                //     // } else {
                //     //     drawPoints(scene.house[obj].vertices);
                //     // }
                // }
            }
            if (obj === 'hatching' && gridMode) {
                drawGrid(scene.house[obj].vertical);
                drawGrid(scene.house[obj].horizontal);
            }
        } else if (obj === 'outerWalls') {
            for (let i = 0; i < scene.house.floors - 1; i++) {
                drawOuterWalls(scene.house[obj]);
                modelMatrix.translate(0, 0, scene.house[obj].height);
                setMatrixUniforms();
                drawObject(scene.house[obj].vertices, scene.house.basement.height / 2, scene.house.basement.color, 'fan');
                modelMatrix.translate(0, 0, scene.house.basement.height / 2);
                setMatrixUniforms();
            }
            drawOuterWalls(scene.house[obj]);
        } else {
            drawObject(scene.house[obj].vertices, scene.house[obj].height, scene.house[obj].color, 'fan');
        }
    }

    modelMatrix.popMatrix();
    setMatrixUniforms();
}

function drawObject(vertices, height, texture, fill) {
    if (vertices) {
        let colors = [];
        let normals = [];
        let indices = [];
        let vertexArray = [];
        let vertexNumber = [];

        // Create a cube
        //    A0----- B0
        //   /|      /|
        //  D0------C0|
        //  | |     | |
        //  | |A----|-|B
        //  |/      |/
        //  D-------C
        // Coordinates

        //координаты вершин
        let k = 0;
        for (let i = 0; i < vertices.length - 2; i += 2) {
            vertexArray.push(vertices[i], vertices[i + 1], k % 2 === 0 ? 0.0 : height); //A, B, ...
            k++;
            vertexArray.push(vertices[i], vertices[i + 1], k % 2 === 0 ? 0.0 : height); //A0, B0, ...
            k++;
            vertexArray.push(vertices[i + 2], vertices[i + 3], k % 2 === 0 ? 0.0 : height); //B, C, ...
            k++;
            vertexArray.push(vertices[i + 2], vertices[i + 3], k % 2 === 0 ? 0.0 : height); //B0, C0, ...
            k++;
        }

        //цвета вершин
        for (let i = 0; i < vertexArray.length / 3; i++) {
            colors.push(texture[0], texture[1], texture[2]);
        }
        //нормали в вершинах
        normals = getNormals(vertices, '3d');

        //    1------ 3
        //   /|      /|
        //  7-------5 |
        //  | |     | |
        //  | |0----|-|2
        //  |/      |/
        //  6-------4
        // Coordinates

        for (let i = 0; i < vertexArray.length / 3 - 3; i += 4) {
            indices.push(i, i + 1, i + 2, i + 1, i + 2, i + 3);
            //0, 1, 2, 1, 2, 3,
            //4,5,6, 5,6,7, ...
        }

        for (let i = 0; i < indices.length; i++) {
            vertexNumber.push(i + 1);
        }

        initAllBuffer(vertexArray, colors, normals, vertexNumber);

        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        let indexBuffer = gl.createBuffer();
        if (!indexBuffer) {
            console.log('Failed to create the buffer object');
            return false;
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array(indices), gl.STATIC_DRAW);

        let n = indices.length;
        gl.drawElements(gl.TRIANGLES, n, gl.UNSIGNED_BYTE, 0);

        if (fill) {
            drawScheme(vertices, height, texture, 'fan');
        }
    } else {
        return;
    }

}

function drawScheme(vertices, height, texture, fill) {
    if (vertices) {
        let colors = [];
        let normals = [];
        let indices = [];
        let vertexArray = [];
        let vertexNumber = [];
        //вершины
        for (let i = 0; i < vertices.length; i++) {
            vertexArray.push(vertices[i]);
            if (i % 2 === 1) {
                vertexArray.push(height);
            }
        }

        if (fill) {
            if (fill === 'fan') {
                //добавление центра многоугольника для закрашивания веером
                let center = getPolygonCenter(vertices);
                vertexArray.unshift(center[0], center[1], height);
            }
            for (let i = 0; i < vertexArray.length / 3; i++) {
                normals.push(0, 0, 1);
                colors.push(texture[0], texture[1], texture[2]);
                vertexNumber.push(i + 1);
            }
        } else {
            for (let i = 0; i < vertexArray.length / 3; i++) {
                normals.push(0, 0, 0);
                colors.push(texture[0], texture[1], texture[2]);
                vertexNumber.push(i + 1);
            }
        }

        initAllBuffer(vertexArray, colors, normals, vertexNumber);

        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        //индексы
        //!!!!!!!!!!!можно определять индексы в условии выше, вместе с цветом и тд
        for (let i = 0; i < vertexArray.length / 3; i++) {
            indices.push(i);
            //0, 1, 2, 3, 4, 5, 6...
        }

        let indexBuffer = gl.createBuffer();
        if (!indexBuffer) {
            console.log('Failed to create the buffer object');
            return false;
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array(indices), gl.STATIC_DRAW);

        let n = indices.length;
        if (fill === 'fan') {
            gl.drawElements(gl.TRIANGLE_FAN, n, gl.UNSIGNED_BYTE, 0);
        } else if (fill === 'strip') {
            gl.drawElements(gl.TRIANGLE_STRIP, n, gl.UNSIGNED_BYTE, 0);
        } else {
            gl.drawElements(gl.LINE_STRIP, n, gl.UNSIGNED_BYTE, 0);
        }
    } else {
        return;
    }
}

function drawPoints(vertices) {
    gl.uniform1i(u_PointsMode, 1);
    let colors = [];
    let normals = [];
    let vertexArray = [];
    let vertexNumber = [];
    for (let i = 0; i < vertices.length; i += 2) {
        vertexArray.push(vertices[i], vertices[i + 1], 0.5); //A, B, ...
        vertexNumber.push(i / 2 + 1);
        colors.push(0.0, 0.0, 0.0);
        normals.push(0, 0, 1);
    }

    initAllBuffer(vertexArray, colors, normals, vertexNumber);

    gl.drawArrays(gl.POINTS, 0, vertices.length / 2);
    gl.uniform1i(u_PointsMode, 0);
}

function drawGrid(vertices) {
    let colors = [];
    let normals = [];
    let vertexArray = [];
    let vertexNumber = [];
    for (let i = 0; i < vertices.length; i += 2) {
        vertexArray.push(vertices[i], vertices[i + 1], 0.0); //A, B, ...
        colors.push(0.9, 0.9, 0.9);
        vertexNumber.push(i / 2 + 1);
        normals.push(0, 0, 1);
    }

    initAllBuffer(vertexArray, colors, normals, vertexNumber);

    gl.drawArrays(gl.LINES, 0, vertices.length / 2);
}

function drawOuterWalls(obj) {
    if (obj.innerVertices.length > 0 && obj.height > 0) {
        //внешние
        drawObject(obj.vertices, obj.height, obj.color, false);
        //внутренние
        drawObject(obj.innerVertices, obj.height, obj.color, false);
        //верх
        drawScheme(obj.getUpVertices(), obj.height, obj.color, 'strip');
    }
}

function drawRoomWalls(obj) {

    let floor = obj.selectedFloor;
    let curveAmount = obj[floor].length;
    let vertices = [],
        widthVertices = [],
        newCoor =[];
    let x1,y1,x2,y2,x3,y4;
    for (let i = 0; i < curveAmount; i++) {
        //получим новые вершины

        vertices = obj[floor][i];
        widthVertices = [];
        for (let j=0; j<vertices.length-3; j+=2) {
            x1=vertices[j]; y1=vertices[j+1];
            x2=vertices[j+2]; y2=vertices[j+3];

            newCoor = setWidthLine(x1,y1,x2,y2,0.05);
            newCoor.forEach(el => widthVertices.push(el));
        }

        if (viewMode === '2d') {
            if (editorMode) {
                drawScheme(vertices, 0, [0, 0, 0], false); //lineStrip
                drawPoints(vertices); //
            } else {
                drawScheme(widthVertices, 0, [0,0,0], false); //linestrip с толщиной
            }
        } else {
            drawObject(widthVertices, obj.height, obj.color, 'strip');
        }
    }

    //проверка 2д/3д
    //проверка режим редактора (строим/редактируем что-то?)
}

function setWidthLine(x1,y1,x2,y2, width) {
    let vertices = [];
    let bag = [];
    let flag = false;
    sinA = Math.abs(x2 - x1) / (Math.sqrt(Math.pow((x2 - x1), 2) + Math.pow((y2 - y1), 2)));
    if ((y1 < y2 && x1 < x2) || (x1 > x2 && y1 > y2)) {
        flag = true;
    }
    vertices = getNeighbours(x1, y1, sinA, width, flag);
    bag=getNeighbours(x2, y2, sinA, width, flag);
    vertices.push(bag[2], bag[3], bag[0], bag[1], vertices[0], vertices[1]);
    return vertices;
}

function getNeighbours(x, y, sinA, width, flag) {
    let cosA, xn, yn, vertices;
    vertices = [];
    cosA = Math.sqrt(1 - Math.pow(sinA, 2));
    if (flag) {
        xn = x - cosA * width / 2;
        yn = y + sinA * width / 2;
        vertices.push(xn, yn);

        xn = x + cosA * width / 2;
        yn = y - sinA * width / 2;
        vertices.push(xn, yn);
    } else {
        xn = x + cosA * width / 2;
        yn = y + sinA * width / 2;
        vertices.push(xn, yn);

        xn = x - cosA * width / 2;
        yn = y - sinA * width / 2;
        vertices.push(xn, yn);
    }

    console.log('getNeighbours');
    console.log(vertices);

    return vertices;
}
/*---------------------------КОНЕЦ РИСОВАНИЕ ФИГУР-----------------------------------------*/


/*---------------------------ОТСЛЕЖИВАНИЕ СТАДИИ ОПРОСА И СОЗДАНИЕ МОДЕЛИ-----------------------------------------*/
function setStage() {
    let interviewDiv = document.querySelector('.interview div'); //поле для опроса в котором будет меняться информация
    let stageNumber = 0; //отслеживание номера стадии

    const stageInfo = document.querySelectorAll('.stageDescriptions>div'); //описание для каждой стадии (заголовок, описнаие и требуемые действия)
    interviewDiv.innerHTML = stageInfo[0].innerHTML;

    const previousBtn = document.querySelector('.interview .previousStage');
    const nextBtn = document.querySelector('.interview .nextStage');
    previousBtn.disabled = true;

    let shapeMenu;
    const numberOfShapes = exampleShapes.length;
    let shapeBtn;
    let selectedShape = 0;

    let floorMenu;
    let selectedFloor = 0;
    checkStage = function () {
        switch (stageNumber) {
            case 0: //построение фундамента
                if (!scene.house.basement) {
                    scene.house.basement = new sceneObject('basement');
                }
                for (obj in scene.house) {
                    if (obj !== 'basement') {
                        clearObj(scene.house[obj]);
                    }
                }
                shapeMenu = document.querySelector('.interview .currentStage #shape');
                shapeMenu.options.selectedIndex = selectedShape;
                shapeBtn = document.querySelectorAll('.interview .currentStage button');
                shapeMenu.onchange = function () {
                    selectedShape = shapeMenu.options.selectedIndex;
                    if (selectedShape < numberOfShapes) {
                        shapeBtn.forEach(btn => {
                            btn.style.display = 'none';
                        });
                    } else {
                        shapeBtn.forEach(btn => {
                            btn.style.display = 'block';
                        });
                    }
                }
                if (shapeMenu.options && (selectedShape === numberOfShapes)) {
                    shapeBtn.forEach(btn => {
                        btn.style.display = 'block';
                    });
                }

                break;
            case 1: //возведение стен
                if (!scene.house.outerWalls) {
                    scene.house.outerWalls = new sceneObject('outerWalls');
                }
                scene.house.floors = 1;
                break;
            case 2: //этажи
                floorMenu = document.querySelector(".interview div #floors");
                floorMenu.options.selectedIndex = selectedFloor;
                scene.house.floors = selectedFloor + 1;
                draw();
                floorMenu.onchange = function () {
                    selectedFloor = floorMenu.options.selectedIndex;
                    scene.house.floors = selectedFloor + 1;
                    draw();
                    if (scene.house.roomWalls) {
                        for (let i = 1; i <= scene.house.floors; i++) {
                            scene.house.roomWalls[i] = {};
                        }
                    }
                }
                break;
            case 3: //межкомнатные стены
                if (!scene.house.hatching) {
                    scene.house.hatching = {};
                }
                scene.house.hatching.horizontal = getStripeCoor(scene.house.outerWalls.innerVertices, convertToCoor(1), 0);
                scene.house.hatching.vertical = getStripeCoor(scene.house.outerWalls.innerVertices, convertToCoor(1), 90);
                // scene.house.hatching.bound = getBoundStripeCoor(scene.house.outerWalls.innerVertices);
                floorMenu = document.querySelector(".interview div #floorNumber");
                floorMenu.innerHTML = '';
                for (let i = 1; i <= scene.house.floors; i++) {
                    let opt = document.createElement('option');
                    opt.value = i;
                    opt.innerHTML = i;
                    floorMenu.appendChild(opt);
                }

                if (!scene.house.roomWalls) {
                    scene.house.roomWalls = new sceneObject('roomWalls');
                    delete scene.house.roomWalls.vertices;
                }
                break;
        }
        createModel();
    }

    checkStage();

    drawButtons();

    previousBtn.onclick = function () {
        if (stageNumber > 0) {
            stageNumber--;
            interviewDiv.innerHTML = stageInfo[stageNumber].innerHTML;
            nextBtn.disabled = false;
        }
        if (stageNumber === 0) {
            this.disabled = true;
            editStage = 'basement';
            drawButtons();
        }
        if (stageNumber === 3) {
            gridMode = true;
            editStage = 'roomWalls';
            drawButtons();
        } else {
            gridMode = false;
        }
        checkStage();
    }

    nextBtn.onclick = function () {
        if (stageNumber < stageInfo.length - 1) {
            stageNumber++;
            interviewDiv.innerHTML = stageInfo[stageNumber].innerHTML;
            previousBtn.disabled = false;
        }
        checkStage();
        if (stageNumber === stageInfo.length - 1) {
            this.disabled = true;
        }
        if (stageNumber === 3) {
            gridMode = true;
            editStage = 'roomWalls';
            drawButtons();
        } else {
            gridMode = false;
        }

    }
}

function createModel() {
    let heightInput;
    let basement = scene.house.basement;
    let outerWalls = scene.house.outerWalls;
    let roomWalls = scene.house.roomWalls;

    if (basement) {
        //получение вершин
        const shapeMenu = document.querySelector('.interview .currentStage #shape');
        const numberOfShapes = exampleShapes.length;

        if (shapeMenu) {
            let shapeNumber = shapeMenu.options.selectedIndex;

            if (shapeNumber < numberOfShapes) {
                basement.vertices = [...exampleShapes[shapeNumber]]; //берется заготовленный вариант  
            }

            shapeMenu.addEventListener('change', function () {
                if (shapeMenu.selectedOptions[0].value >= numberOfShapes) {
                    set2D();
                } else {
                    if (outerWalls) {
                        outerWalls.innerVertices = [];
                    }
                    createModel();
                }
            });
        }

        //получение высоты
        heightInput = document.querySelector(".interview div #basement");
        let heightInfoInput = document.querySelector(".stageDescriptions .stageBasement #basement");

        if (heightInput) {
            basement.height = Number(convertToCoor(heightInput.value));
            heightInfoInput.setAttribute('value', heightInput.value);
            heightInput.onchange = function () {
                createModel();
            }
        }

        basement.color = [0, 0, 1];
    }

    if (outerWalls) {
        heightInput = document.querySelector(".interview div #wallHeight");
        let heightInfoInput = document.querySelector(".stageDescriptions .stageOuterWalls #wallHeight");

        if (heightInput) {
            outerWalls.height = Number(convertToCoor(heightInput.value));
            heightInfoInput.setAttribute('value', heightInput.value);
            heightInput.onchange = function () {
                createModel();
            }
        }

        widthInput = document.querySelector(".interview div #wallWidth");
        let widthInfoInput = document.querySelector(".stageDescriptions .stageOuterWalls #wallWidth");
        let wallWidth;
        if (widthInput) {
            wallWidth = Number(convertToCoor(widthInput.value));
            widthInfoInput.setAttribute('value', widthInput.value);
            widthInput.onchange = function () {
                createModel();
            }
        }

        outerWalls.vertices = basement.vertices;
        outerWalls.color = [0.8, 0, 0];
        outerWalls.translation = [0, 0, basement.height];

        //внутренний контур стен
        if (wallWidth > 0) {
            outerWalls.innerVertices = [];
            outerWalls.innerVertices = getInnerVertices(outerWalls.vertices, wallWidth);
        }
    }

    if (roomWalls) {
        for (let i = 1; i <= scene.house.floors; i++) {
            scene.house.roomWalls[i] = [];
        }
        roomWalls.color = [0.4, 0.4, 0.4];
        roomWalls.translation = outerWalls.translation;
        roomWalls.height = outerWalls.height;
        roomWalls.width = 0;
        roomWalls.selectedFloor = 1;
    }
    draw();
}

function clearObj(obj) {
    obj.vertices = [];
    obj.innerVertices = [];
    obj.height = 0;
    obj.color = [0, 0, 0];
    obj.translation = [0, 0, 0];
}
/*---------------------------КОНЕЦ ОТСЛЕЖИВАНИЕ СТАДИИ ОПРОСА И СОЗДАНИЕ МОДЕЛИ-----------------------------------------*/



/*---------------------------УСТАНОВКА ВИДА-----------------------------------------*/
function set2D() {
    modelMatrix.setIdentity();
    // modelMatrix.setScale(6,6,1);
    viewMatrix.setIdentity();
    perspectiveMatrix.setIdentity();
    normalMatrix.setIdentity();
    normalMatrix.setInverseOf(modelMatrix);
    normalMatrix.transpose();
    setMatrixUniforms();
    viewMode = '2d';
    // createModel();
    draw();
    disableViewButtons();
}

function set3D() {
    perspectiveMatrix.setPerspective(30, canvas.width / canvas.height, 1, 100);
    viewMatrix.lookAt(-3, -3, 1.5, 0, 0, 0, 0, 0, 1);
    // viewMatrix.lookAt(-0, -0, 3.8, 0, 0, 0, 0, 1, 0); //вид сверху
    normalMatrix.setIdentity();
    normalMatrix.setInverseOf(modelMatrix);
    normalMatrix.transpose();
    setMatrixUniforms();
    viewMode = '3d';
    createModel();
    enableViewButtons();
    currentAngle = [0, 0];
    initEventHandlers(canvas, currentAngle);
}
/*---------------------------КОНЕЦ УСТАНОВКА ВИДА-----------------------------------------*/


/*---------------------------СОЗДАНИЕ И РЕДАКТИРОВАНИЕ ФОРМЫ ЗДАНИЯ-----------------------------------------*/

function drawButtons() {
    let obj = scene.house[editStage];

    let shapeBtn = document.querySelectorAll('.interview .currentStage button');

    const select = document.querySelector('.interview .currentStage select');
    const prevBtn = document.querySelector('.interview .previousStage');
    const nextBtn = document.querySelector('.interview .nextStage');
    const interactiveBtn = document.querySelectorAll('.editor__buttons button');

    let fullVertices = false;
    let gridStage = false;

    if (editStage === 'basement' && obj.vertices.length > 0) {
        fullVertices = true;
    } else
    if (editStage === 'roomWalls') {
        gridStage = true;
        let menu = document.querySelector('.interview .currentStage #floorNumber');
        let floor = menu.options.selectedIndex + 1;
        scene.house.roomWalls.selectedFloor = floor;
        if (obj[floor].length > 0) {
            fullVertices = true;
        }
        menu.onchange = function () {
            drawButtons();
        }
    }

    if (shapeBtn) {
        let createBtn = shapeBtn[0];
        let editBtn = shapeBtn[1];
        let clearBtn = shapeBtn[2];

        if (fullVertices) {
            createBtn.setAttribute('disabled', true);
            editBtn.removeAttribute('disabled');
        } else {
            createBtn.removeAttribute('disabled');
            editBtn.setAttribute('disabled', true);
            clearBtn.setAttribute('disabled', true);
        }

        createBtn.onclick = function () {
            if (createBtn.innerHTML === 'Построить') {
                shapeBtn.forEach(btn => {
                    if (btn !== createBtn) {
                        btn.setAttribute('disabled', true);
                    }
                });
                if (gridStage) {
                    gridMode = true;
                    draw();
                }
                drawEditor(obj, createBtn);
                createBtn.innerHTML = 'Закончить';

            } else {
                createBtn.innerHTML = 'Построить';
                shapeBtn.forEach(btn => {
                    if (btn !== createBtn) {
                        btn.removeAttribute('disabled');
                    }
                });
                if (gridStage) {
                    gridMode = false;
                }
                gl.uniform1i(u_PickedVertex, -1);
                drawEditor(obj, createBtn);

                select.disabled = false;
                if (editStage !== 'basement') {
                    prevBtn.disabled = false;
                }
                nextBtn.disabled = false; //снимаем блокировку перехода на другую стадию при редактировании
                interactiveBtn[0].disabled = false; //снимаем блокировку перехода в 2д вид при редактировании
                interactiveBtn[1].disabled = false; //снимаем блокировку перехода в 3д вид при редактировании
            }
            drawButtons();
        }

        editBtn.onclick = function () {
            if (editBtn.innerHTML === 'Редактировать') {
                shapeBtn.forEach(btn => {
                    if (btn !== editBtn) {
                        btn.setAttribute('disabled', true);
                    }
                });
                if (gridStage) {
                    gridMode = true;
                    draw();
                }
                drawEditor(obj, editBtn);
                draw();
                editBtn.innerHTML = 'Закончить';

            } else {
                editBtn.innerHTML = 'Редактировать';
                shapeBtn.forEach(btn => {
                    if (btn !== editBtn) {
                        btn.removeAttribute('disabled');
                    }
                });
                if (gridStage) {
                    gridMode = false;
                    // draw();
                }
                drawEditor(obj, editBtn);
                // draw();

                select.disabled = false;
                if (editStage !== 'basement') {
                    prevBtn.disabled = false;
                }
                nextBtn.disabled = false; //снимаем блокировку перехода на другую стадию при редактировании
                interactiveBtn[0].disabled = false; //снимаем блокировку перехода в 2д вид при редактировании
                interactiveBtn[1].disabled = false; //снимаем блокировку перехода в 3д вид при редактировании
            }
            drawButtons();
        }

        clearBtn.onclick = function () {
            if (editStage === 'basement') {
                for (let obj in scene.house) {
                    clearObj(scene.house[obj]);

                    //исправить clearObj под roomWalls (сейчас чистит свойство вершины, которое удалено).
                }
            } else
            if (editStage === 'roomWalls') {
                let floor = obj.selectedFloor;
                obj[floor] = [];
                rightClick = 0;
            }

            draw();
            drawButtons();
        }
    }

}

function drawEditor(obj, btn) {
    editorMode = (!editorMode);
    let windowWidth = document.documentElement.clientWidth;

    const select = document.querySelector('.interview .currentStage select');
    const prevBtn = document.querySelector('.interview .previousStage');
    const nextBtn = document.querySelector('.interview .nextStage');
    const interactiveBtn = document.querySelectorAll('.editor__buttons button');

    if (editorMode) {
        select.disabled = true;
        prevBtn.disabled = true;
        nextBtn.disabled = true; //блокируем переход на другую стадию при редактировании
        interactiveBtn[0].disabled = true; //блокируем переход в 2д вид при редактировании
        interactiveBtn[1].disabled = true; //блокируем переход в 3д вид при редактировании
        if (obj === scene.house.basement) {
            if (btn.innerHTML === 'Построить') {
                if (windowWidth < 1024) {
                    canvas.ontouchstart = function (event) {
                        let coor = getTouchCoord(event);
                        let x = coor[0],
                            y = coor[1];
                        drawShapeDown(event, x, y, obj);
                    }
                } else {
                    canvas.onmousedown = function (event) {
                        let coor = getMouseCoord(event);
                        let x = coor[0],
                            y = coor[1];
                        drawShapeDown(event, x, y, obj);
                    }
                    canvas.onmousemove = function (event) {
                        let coor = getMouseCoord(event);
                        let x = coor[0],
                            y = coor[1];
                        drawShapeMove(x, y, obj);
                    }
                }
            } else
            if (btn.innerHTML === 'Редактировать') {
                if (windowWidth < 1024) {
                    canvas.ontouchstart = function (event) {
                        let vertex = changeShapeDown(event);
                        canvas.ontouchmove = function (event) {
                            let coor = getTouchCoord(event);
                            let x = coor[0],
                                y = coor[1];
                            changeShapeMove(x, y, obj, vertex);
                        }
                        return false;
                    }
                    canvas.ontouchend = function () {
                        drawClick = 0;
                    }
                } else {
                    canvas.onmousedown = function (event) {
                        let vertex = changeShapeDown(event);
                        canvas.onmousemove = function (event) {
                            let coor = getMouseCoord(event);
                            let x = coor[0],
                                y = coor[1];
                            changeShapeMove(x, y, obj, vertex);
                        }
                    }
                    canvas.onmouseup = function () {
                        drawClick = 0;
                    }
                }
            }
        } else
        if (obj === scene.house.roomWalls) {
            if (btn.innerHTML === 'Построить') {
                if (windowWidth < 1024) {
                    canvas.ontouchstart = function (event) {
                        // let coor = getTouchCoord(event);
                        // let x = coor[0],
                        //     y = coor[1];
                        // drawShapeDown(event, x, y, obj);
                    }
                } else {
                    let currentFloor = document.querySelector('.interview .currentStage #floorNumber').options.selectedIndex + 1;
                    canvas.onmousedown = function (event) {
                        let coor = getMouseCoord(event);
                        let x = coor[0],
                            y = coor[1];

                        drawWallsDown(event, x, y, obj[currentFloor], leftClick, rightClick);
                    }
                    canvas.onmousemove = function (event) {
                        let coor = getMouseCoord(event);
                        let x = coor[0],
                            y = coor[1];

                        drawWallsMove(x, y, obj[currentFloor], leftClick, rightClick);
                    }
                }
            } else
            if (btn.innerHTML === 'Редактировать') {
                if (windowWidth < 1024) {
                    canvas.ontouchstart = function (event) {
                        // let vertex = changeShapeDown(event);
                        // canvas.ontouchmove = function (event) {
                        //     let coor = getTouchCoord(event);
                        //     let x = coor[0],
                        //         y = coor[1];
                        //     changeShapeMove(x, y, obj, vertex);
                        // }
                        // return false;
                    }
                    canvas.ontouchend = function () {
                        drawClick = 0;
                    }
                } else {
                    canvas.onmousedown = function (event) {
                        // let vertex = changeShapeDown(event);
                        // canvas.onmousemove = function (event) {
                        //     let coor = getMouseCoord(event);
                        //     let x = coor[0],
                        //         y = coor[1];
                        //     changeShapeMove(x, y, obj, vertex);
                        // }
                    }
                    canvas.onmouseup = function () {
                        drawClick = 0;
                    }
                }
            }
        }
    } else {
        canvas.onmousedown = function () {
            return false;
        }
        canvas.onmousemove = function () {
            return false;
        }
        canvas.onmouseup = function () {
            return false;
        }
        canvas.ontouchstart = function () {
            return false;
        }
        canvas.ontouchmove = function () {
            return false;
        }
        canvas.ontouchend = function () {
            return false;
        }
        gl.uniform1i(u_PickedVertex, -1);
        draw();
    }
}

let drawClick = 0; //отслеживание клика при рисовании

function drawShapeDown(event, x, y, obj) {
    if (event.which === 1 || (event.touches && event.touches.length === 1)) {
        obj.vertices.push(x, y);
        draw();
        drawClick++;
    } else if (event.which === 3 || (event.touches && event.touches.length === 2)) {
        if (drawClick > 0) {
            obj.vertices.pop();
            obj.vertices.pop();
        }
        x = obj.vertices[0];
        y = obj.vertices[1];
        obj.vertices.push(x, y);
        drawClick = 0;
        drawEditor(obj, null);
        editorMode = true;
        draw();
    }
}

function drawShapeMove(x, y, obj) {
    if (drawClick > 0) {
        let len = obj.vertices.length;

        if (len / 2 % (drawClick + 1) === 0) {
            obj.vertices.pop();
            obj.vertices.pop();
        }
        obj.vertices.push(x, y);
        draw();
    }
}

function changeShapeDown(event) {
    let x, y;
    if (event.which === 1) {
        x = event.clientX;
        y = event.clientY;
    } else if (event.touches && event.touches.length === 1) {
        x = event.touches[0].clientX;
        y = event.touches[0].clientY;
    }
    let rect = canvas.getBoundingClientRect();
    x = x - rect.left;
    y = rect.bottom - y;
    let vertex = checkVertex(x, y, u_PickedVertex);
    gl.uniform1i(u_PickedVertex, vertex);
    draw();
    drawClick++;
    return vertex;
}

function changeShapeMove(x, y, obj, num) {
    if (drawClick > 0) {
        if (num < obj.vertices.length / 2) {
            obj.vertices[(num - 1) * 2] = x;
            obj.vertices[(num - 1) * 2 + 1] = y;
            if (num === 1) {
                obj.vertices[obj.vertices.length - 2] = x;
                obj.vertices[obj.vertices.length - 1] = y;
            }
            draw();
        }
    }
}

function checkVertex(x, y, u_PickedVertex) {
    let pixels = new Uint8Array(4);
    gl.uniform1i(u_PickedVertex, 0);
    draw();
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels[3];
}

let leftClick = 0;
let rightClick = 0;

function drawWallsDown(event, x, y, obj) { //, leftClick, rightClick
    //объявить снаружи
    // let leftClick = 0, 
    //     rightClick = 0;
    if (event.which === 1 || (event.touches && event.touches.length === 1)) {
        if (!obj[rightClick]) {
            obj[rightClick] = [];
        }

        let len = obj[rightClick].length;
        if (len / 2 % (leftClick + 1) === 0) {
            obj[rightClick].pop();
            obj[rightClick].pop();
        }

        obj[rightClick].push(x, y);
        draw();
        leftClick++;
    } else if (event.which === 3 || (event.touches && event.touches.length === 2)) {
        if (leftClick > 0) {
            if (leftClick === 1) {
                obj[rightClick] = [];
                rightClick--;
            } else {
                obj[rightClick].pop();
                obj[rightClick].pop();
            }
        }
        leftClick = 0;
        rightClick++;
        console.log(obj);
        draw();
    }
}

function drawWallsMove(x, y, obj) { //, leftClick, rightClick
    if (leftClick > 0) {
        let len = obj[rightClick].length;

        if (len / 2 % (leftClick + 1) === 0) {
            obj[rightClick].pop();
            obj[rightClick].pop();
        }
        obj[rightClick].push(x, y);
        draw();
    }
}


/*---------------------------КОНЕЦ СОЗДАНИЕ И РЕДАКТИРОВАНИЕ ФОРМЫ-----------------------------------------*/

/*---------------------------ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ-----------------------------------------*/
function convertToCoor(val) {
    // return val * (canvas.width / 20) / (canvas.width / 2);
    return val / 10;
}

function toDeg(rad) {
    return rad * 180 / Math.PI;
}

function toRad(deg) {
    return deg / 180 * Math.PI;
}

function getNormals(vertices, mode) {
    let m = {}; //вектор прямой
    let n = {}; //вектор нормали
    let normals = [];

    for (let i = 0; i < vertices.length; i += 2) {
        if (i === vertices.length - 2) {
            m.x = vertices[0] - vertices[i];
            m.y = vertices[1] - vertices[i + 1];
        } else {
            m.x = vertices[i + 2] - vertices[i];
            m.y = vertices[i + 3] - vertices[i + 1];
        }
        n = getNormalVector(m);
        let k;
        if (mode === '2d') {
            k = 1;
        } else {
            k = 4;
        }
        for (let i = 0; i < k; i++) {
            normals.push(n.x, n.y, 0.0);
        }
    }
    return normals;
}

function getNormalVector(m) {
    let n = {};
    if (m.x === 0) {
        n.y = 0;
        if (m.y > 0) {
            n.x = -1;
        } else {
            n.x = 1;
        }
    } else if (m.y === 0) {
        n.x = 0;
        if (m.x > 0) {
            n.y = 1;
        } else {
            n.y = -1;
        }
    } else {
        if (m.x > 0) {
            n.y = 1;
        } else {
            n.y = -1
        }
        n.x = -m.y * n.y / m.x;
    }
    return n;
}

function flipNormals(normals) {
    for (let i = 0; i < normals.length; i++) {
        if (normals[i] !== 0) {
            normals[i] = -normals[i];
        }
    }
}

//угол между двумя вектормаи
function vectorAngle(v1, v2) {
    let vectorMult = v1[0] * v2[0] + v1[1] * v2[1];
    let absV1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]);
    let absV2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);
    let result = vectorMult / (absV1 * absV2);
    if (result === -0) {
        return 0;
    }
    return result;
}

//площадь многоугольника
function getArea(vertices) {
    let s = 0;
    for (let i = 0; i < vertices.length - 2; i += 2) {
        s += vertices[i] * vertices[i + 3] - vertices[i + 1] * vertices[i + 2]; //x1*y2-x2*y1
    }
    return s / 2;
}

//барицентр многоугольника
function getPolygonCenter(vertices) {
    let x = 0,
        y = 0;
    let s = getArea(vertices);
    for (let i = 0; i < vertices.length - 2; i += 2) {
        x += (vertices[i] + vertices[i + 2]) * (vertices[i] * vertices[i + 3] - vertices[i + 1] * vertices[i + 2]);
        y += (vertices[i + 1] + vertices[i + 3]) * (vertices[i] * vertices[i + 3] - vertices[i + 1] * vertices[i + 2]);
    }
    x /= 6 * s;
    y /= 6 * s;
    return [x, y];
}

/* function checkSymmetry(vertices) {
//     let sumLeft = 0,
//         sumRight = 0;
//     for (let i = 0; i < vertices.length; i += 2) {
//         if (vertices[i] > 0) {
//             sumLeft += vertices[i];
//         } else {
//             sumRight += vertices[i];
//         }
//     }
//     if (Math.abs(sumRight) <= Math.abs(sumLeft) * 1.1 && Math.abs(sumRight) >= Math.abs(sumLeft) * 0.9) {
//         return true;
//     } else {
//         return false;
//     }
// } */

//масштабирование многоугольника внутрь
function getInnerVertices(vertices, width) {
    let result = [];
    let innerVertices = [];
    let s = getArea(vertices);
    let round;
    if (s > 0) {
        round = 'left';
    } else {
        round = 'right';
    }
    for (let i = 2; i < vertices.length - 2; i += 2) {
        result = getIntro(vertices[i - 2], vertices[i - 1], vertices[i], vertices[i + 1], vertices[i + 2], vertices[i + 3], width, round);
        innerVertices.push(result[0], result[1]);
    }
    let len = vertices.length;
    result = getIntro(vertices[len - 4], vertices[len - 3], vertices[0], vertices[1], vertices[2], vertices[3], width, round);
    innerVertices.unshift(result[0], result[1]);
    innerVertices.push(result[0], result[1]);
    console.log(innerVertices);
    console.log(vertices);
    console.log(width);
    return innerVertices;
}
//нахождение точки, лежащей на биссектрисе
function getIntro(x1, y1, x2, y2, x3, y3, width, round) { //round - обход, left - против часовой, right - по часовой
    let a = [],
        b = [],
        c = [],
        d = [];
    let k = (round === 'left') ? -1 : 1;
    a.push(x1 - x2, y1 - y2);
    let absA = absVector(a);
    a[0] = a[0] / absA;
    a[1] = a[1] / absA;
    b.push(x3 - x2, y3 - y2);
    let absB = absVector(b);
    b[0] = b[0] / absB;
    b[1] = b[1] / absB;
    c.push(k * (a[0] + b[0]), k * (a[1] + b[1]));
    if ((-a[0] * b[1] - b[0] * (-a[1])) > 0) {
        c[0] = -c[0];
        c[1] = -c[1];
    }

    let cos2A = vectorAngle(a, b);
    // let sinA;
    // if (cos2A !== 0) {
    //     sinA = Math.sqrt((1 - cos2A) / 2);
    //     width = width / sinA;
    // }

    // k = width * Math.sqrt(2 / (Math.pow(c[0], 2) + Math.pow(c[1], 2)));
    // d.push(k * c[0], k * c[1]);
    d = setVectorLength(cos2A, width, c);
    d[0] = d[0] + x2;
    d[1] = d[1] + y2;
    return d;
}

function setVectorLength(cos, width, vec) {
    let sinA, k, result = [];
    if (cos !== 0) {
        sinA = Math.sqrt((1 - cos) / 2);
        width = width / sinA;
    }
    k = width * Math.sqrt(2 / (Math.pow(vec[0], 2) + Math.pow(vec[1], 2)));
    result.push(k * vec[0], k * vec[1]);
    return result;
}

//длина вектора
function absVector(a) {
    return Math.sqrt(a[0] * a[0] + a[1] * a[1]);
}
//координаты клика
function getMouseCoord(event) {
    let x = event.clientX;
    let y = event.clientY;

    let middle_X = gl.canvas.width / 2;
    let middle_Y = gl.canvas.height / 2;

    let rect = canvas.getBoundingClientRect();

    x = ((x - rect.left) - middle_X) / middle_X;
    y = (middle_Y - (y - rect.top)) / middle_Y;

    return [x, y];
}
//координаты клика по заштрихованному полю
function getRoundCoord(event) {
    let coor = getMouseCoord(event);
    let x = coor[0],
        y = coor[1],
        vertical = scene.house.hatching.vertical,
        horizontal = scene.house.hatching.horizontal,
        // bound = scene.house.hatching.bound,
        // innerVertices = scene.house.outerWalls.innerVertices,
        dx = 999999999,
        dy = 999999999;
    for (let i = 0; i < vertical.length; i += 4) {
        if (Math.abs(x - vertical[i]) < Math.abs(dx)) {
            dx = x - vertical[i];
        }
    }
    for (let i = 0; i < horizontal.length; i += 4) {
        if (Math.abs(y - horizontal[i + 1]) < Math.abs(dy)) {
            dy = y - horizontal[i + 1];
        }
    }
    // for (let i=0; i<bound.length; i+=2) {
    //     if (Math.abs(y-bound[i+1]) < Math.abs(dy) && Math.abs(x-bound[i])<Math.abs(dx))
    //     {
    //         dx = x-bound[i];
    //         dy = y-bound[i+1];
    //     }
    // }
    x -= dx;
    y -= dy;

    return [Number(x.toFixed(5)), Number(y.toFixed(5))];
}
//координаты касания пальцем
function getTouchCoord(event) {
    let x = event.touches[0].clientX;
    let y = event.touches[0].clientY;

    let middle_X = gl.canvas.width / 2;
    let middle_Y = gl.canvas.height / 2;

    let rect = canvas.getBoundingClientRect();

    x = ((x - rect.left) - middle_X) / middle_X;
    y = (middle_Y - (y - rect.top)) / middle_Y;

    return [x, y];
}
//получение координат точек для штриховки
function getStripeCoor(vertices, spacing, angle) {
    const maxNodes = 1000,
        farAway = 999999999;
    let spanMin = farAway,
        spanMax = -farAway,
        theCos, theSin, nodeX = [],
        x, y, a, b, newX, stripeY,
        spanStart, spanEnd, nodeCount, result = [];

    theCos = Math.cos(toRad(angle)).toFixed(5);
    theSin = Math.sin(toRad(angle)).toFixed(5);

    for (let i = 0; i < vertices.length; i += 2) {
        x = vertices[i];
        y = vertices[i + 1];
        y = y * theCos - x * theSin;
        if (spanMin > y) spanMin = y;
        if (spanMax < y) spanMax = y;
    }

    spanStart = Math.floor(spanMin / spacing) - 1;
    spanEnd = Math.floor(spanMax / spacing) + 1;
    // spanStart = Math.floor(spanMin / spacing);
    // spanEnd = Math.floor(spanMax / spacing);

    for (let step = spanStart; step <= spanEnd; step++) {
        nodeCount = 0;
        stripeY = spacing * step;
        for (let j = 0; j < vertices.length - 2; j += 2) {
            a = vertices[j];
            b = vertices[j + 1];
            x = vertices[j + 2];
            y = vertices[j + 3];

            newX = a * theCos + b * theSin;
            b = b * theCos - a * theSin;
            a = newX;
            newX = x * theCos + y * theSin;
            y = y * theCos - x * theSin;
            x = newX;

            if (b < stripeY && y >= stripeY || b >= stripeY && y < stripeY) {
                if (nodeCount >= maxNodes) return null;
                nodeX[nodeCount++] = a + (x - a) * (stripeY - b) / (y - b);
            }
        }
        nodeX.sort(function (a, b) {
            return a - b;
        });

        for (let i = 0; i < nodeCount; i++) {
            a = nodeX[i] * theCos - stripeY * theSin;
            b = stripeY * theCos + nodeX[i] * theSin;
            result.push(Number(a.toFixed(5)), Number(b.toFixed(5)));
        }
    }

    return result;
}
//вершины, лежащие на сторонах многоугольника и не попавшие в vertical/horizontal
function getBoundStripeCoor(vertices) {
    let vertical = scene.house.hatching.vertical,
        horizontal = scene.house.hatching.horizontal,
        bound = [],
        x1, y1, x2, y2, x, y, k;
    for (let i = 0; i < vertices.length - 4; i += 2) {
        x1 = vertices[i];
        y1 = vertices[i + 1];
        x2 = vertices[i + 2];
        y2 = vertices[i + 3];

        //проверка вертикалей
        if (x2 != x1) {
            for (let j = 0; j < vertical.length; j += 4) {
                x = vertical[j];
                if (x1 <= x && x <= x2 || x2 <= x && x <= x1) {
                    y = -((x1 * x2 - y1 * x2) + x * (y1 - y2)) / (x2 - x1);

                    if (!(vertical[j + 1] === y || vertical[j + 3] === y)) {
                        k = horizontal.indexOf(y);
                        if (k === -1) {
                            bound.push(x, y);
                        } else
                        if (!(horizontal[k - 1] === x || horizontal[k + 1] === x)) {
                            bound.push(x, y);
                        }
                    }
                }
            }
        }
        //проверка горизонталей
        if (y2 != y1) {
            for (let j = 0; j < horizontal.length; j += 4) {
                y = horizontal[j + 1];
                if (y1 <= y && y <= y2 || y2 <= y && y <= y1) {
                    x = -((x1 * x2 - y1 * x2) + y * (x2 - x1)) / (y1 - y2);
                    if (!(horizontal[j] === x || horizontal[j + 2] === x)) {
                        k = vertical.indexOf(x);
                        if (k === -1) {
                            bound.push(x, y);
                        } else
                        if (!(vertical[k + 1] === y || vertical[k + 3] === y)) {
                            bound.push(x, y);
                        }
                    }
                }
            }
        }
    }
    return bound;
}

function pointInPolygon(vertices, vertex) {}
/*---------------------------КОНЕЦ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ-----------------------------------------*/


/*---------------------------РАБОТА С ВИДОМ НА МОДЕЛЬ-----------------------------------------*/
function zoomIn() {
    viewMatrix.scale(1.5, 1.5, 1.5);
    setMatrixUniforms();
    draw();
}

function zoomOut() {
    viewMatrix.scale(0.7, 0.7, 0.7);
    setMatrixUniforms();
    draw();
}

function turnRight() {
    modelMatrix.rotate(-180 / 24, 0, 0, 1);
    normalMatrix.setInverseOf(modelMatrix);
    normalMatrix.transpose();
    setMatrixUniforms();
    draw();
}

function turnLeft() {
    modelMatrix.rotate(180 / 24, 0, 0, 1);
    normalMatrix.setInverseOf(modelMatrix);
    normalMatrix.transpose();
    setMatrixUniforms();
    draw();
}

function moveForward() {
    viewMatrix.translate(-0.1, -0.1, 0);
    setMatrixUniforms();
    draw();
}

function moveBackward() {
    viewMatrix.translate(0.1, 0.1, 0);
    setMatrixUniforms();
    draw();
}

function disableViewButtons() {
    viewButtons.forEach(btn => {
        if (!(btn.innerHTML == '2D' || btn.innerHTML == '3D')) {
            btn.setAttribute("disabled", true);
        } else if (btn.innerHTML == '3D') {
            btn.removeAttribute("disabled");
        }
    })
}

function enableViewButtons() {
    viewButtons.forEach(btn => {
        if (!(btn.innerHTML == '2D' || btn.innerHTML == '3D')) {
            btn.removeAttribute("disabled");
        } else if (btn.innerHTML == '3D') {
            btn.setAttribute("disabled", true);
        }
    });
}

function makeBig() {
    canvas.style.position = "fixed";
    canvas.style.top = "0";
    canvas.style.left = "10%";
    canvas.width = 800;
    canvas.height = 800;
}

function makeSmall() {
    canvas.style.position = "initial";
    canvas.width = 500;
    canvas.height = 500;
}

function rotateDown(ev, dragging) {
    var x = ev.clientX,
        y = ev.clientY;
    // Start dragging if a moue is in <canvas>
    var rect = ev.target.getBoundingClientRect();
    if (rect.left <= x && x < rect.right && rect.top <= y && y < rect.bottom) {
        lastX = x;
        lastY = y;
        dragging = true;
    }
}

function initEventHandlers(canvas, currentAngle) {
    if (!editorMode && viewMode === '3d') {
        let dragging = false;
        let lastX, lastY;
        let windowWidth = document.documentElement.clientWidth;
        let rotateDown = function (x, y) {
            let rect = canvas.getBoundingClientRect();
            if (rect.left <= x && x < rect.right && rect.top <= y && y < rect.bottom) {
                lastX = x;
                lastY = y;
                dragging = true;
            }
        }
        let rotateMove = function (x, y) {
            if (dragging) {
                let factorX = 1 / 120; // The rotation ratio
                let factorY = 0.005; // The rotation ratio
                let dx = factorX * (x - lastX);
                let dy = factorY * (y - lastY);
                // dy должен меняться от
                // currentAngle должен меняться от -1 до 2.5 
                currentAngle[0] += dx;
                currentAngle[1] = Math.max(Math.min(currentAngle[1] + dy, 2.5), -1);
            }
            lastX = x;
            lastY = y;

            modelMatrix.rotate(currentAngle[0], 0, 0, 1);
            normalMatrix.setInverseOf(modelMatrix);
            normalMatrix.transpose();
            // viewMatrix.lookAt(-3, -3, Math.max(Math.min(currentAngle[1]+1.5, 4), 0.5), 0, 0, 0, 0, 0, 1);
            // viewMatrix.rotate(currentAngle[1], 1, 0, 0);
            //
            setMatrixUniforms();
            draw();
        }
        if (windowWidth < 1024) {
            canvas.ontouchstart = function (ev) {
                let x = ev.touches[0].clientX;
                let y = ev.touches[0].clientY;
                rotateDown(x, y);

                canvas.ontouchmove = function (ev) {
                    let x = ev.touches[0].clientX;
                    let y = ev.touches[0].clientY;
                    rotateMove(x, y);
                }
            }
            canvas.ontouchend = function () {
                canvas.ontouchmove = function () {
                    return false;
                }
                currentAngle = [0, 0];
            }
        } else {
            canvas.onmousedown = function (ev) {
                let x = ev.clientX;
                let y = ev.clientY;
                rotateDown(x, y);

                canvas.onmousemove = function (ev) {
                    let x = ev.clientX;
                    let y = ev.clientY;
                    rotateMove(x, y);
                }
            }
            canvas.onmouseup = function () {
                canvas.onmousemove = function () {
                    return false;
                }
                currentAngle = [0, 0];
            }
        }
    }
}
/*---------------------------КОНЕЦ РАБОТА С ВИДОМ НА МОДЕЛЬ-----------------------------------------*/