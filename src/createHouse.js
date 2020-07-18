/*
    -------ШЕЙДЕРЫ-------
*/
const VSHADER =
    'attribute vec4 a_Position; \n' +
    'attribute vec4 a_Color;\n' +
    'attribute vec4 a_Normal;\n' +

    'uniform mat4 u_MvpMatrix;\n' +
    'uniform mat4 u_ModelMatrix;\n' +
    'uniform mat4 u_NormalMatrix;\n' +

    'varying vec4 v_Color;\n' +
    'varying vec3 v_Normal;\n' +
    'varying vec3 v_Position;\n' +

    'void main() { \n' +
    '  gl_Position = u_MvpMatrix * a_Position;\n' +
    '  v_Position = vec3(u_ModelMatrix * a_Position);\n' +
    '  v_Normal = normalize(vec3(u_NormalMatrix * a_Normal));\n' +
    '  v_Color = a_Color;\n' +
    '}\n';


const FSHADER =
    'precision mediump float; \n' +
    'uniform vec3 u_LightColor;\n' +
    'uniform vec3 u_LightPosition;\n' +
    'uniform vec3 u_AmbientLight;\n' +

    'varying vec4 v_Color;\n' +
    'varying vec3 v_Normal;\n' +
    'varying vec3 v_Position;\n' +

    'void main() {\n' +
    '  vec3 normal = normalize(v_Normal);\n' +
    '  vec3 lightDirection = normalize(u_LightPosition - v_Position);\n' +
    '  float nDotL = max(dot(lightDirection, normal), 0.0);\n' +
    '  vec3 diffuse = u_LightColor * v_Color.rgb * nDotL;\n' +
    '  vec3 ambient = u_AmbientLight * v_Color.rgb;\n' +
    '  gl_FragColor = vec4(diffuse + ambient, v_Color.a);\n' +

    '} \n';

/*
    -------ГЛОБАВЛЬНЫЕ ПЕРЕМЕННЫЕ-------
*/

const canvas = document.createElement('canvas');
const gl = canvas.getContext("webgl", {
    antialias: false
}); //контекст WebGL

let shaderProgram; //программа

let a_Position;
let a_Color;
let a_normal;
let u_MvpMatrix;
let u_ModelMatrix;
let u_NormalMatrix;
let u_LightColor;
let u_LightDirection;
let u_AmbientLight;

let viewMode; //режим показа - 2D/3D
let editorMode; //режим работы редактора - если true, то можно выполнять построения, если false - то только просмотр
let modelingStage; //стадия моделирования

const viewButtons = document.querySelectorAll(".editor .editor__buttons button"); //кнопки в окне

let drawClick = false; //отслеживание клика при рисовании

//-----матрицы для отображения
let modelMatrix = new Matrix4(); // Model matrix
let viewMatrix = new Matrix4();
let perspectiveMatrix = new Matrix4();
let mvpMatrix = new Matrix4(); // Model view projection matrix
let normalMatrix = new Matrix4(); // Transformation matrix for normals

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
    -0.5, 0.5],

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
    -0.5, 0.7],

    [0.0, 0.5,
        0.5, 0.5,
        0.5, 0.0,
        0.0, 0.0,
        0.0, 0.5],

    [-0.1, 0.4,
        0.1, 0.4,
        0.05, 0.1,
        0.1, 0.05,
        0.4, 0.1,
        0.4, -0.1,
        0.1, -0.05,
        0.05, -0.1,
        0.1, -0.4,
    -0.1, -0.4,
    -0.05, -0.1,
    -0.1, -0.05,
    -0.4, -0.1,
    -0.4, 0.1,
    -0.1, 0.05,
    -0.05, 0.1,
    -0.1, 0.4]
];


//----------иерархия объектов----------
//конструктор объектов
class sceneObject {
    constructor(nameObj) {
        this.name = nameObj;
        this.vertices = [];
        this.height = 0;
        // this.indices=[];
        this.color = [0, 0, 0];
        // this.texCoord=[];
        this.translation = [0, 0, 0];
    }
    setParent(parentObj) {
        this.parent = parentObj;
    }
}

let scene = {}; //объект, в котором будем хранить все элементы сцены (объект хранщий всебе объекты)
//добавляем на сцену объект дом
scene.house = {};





/*--------------------------------------------------------------------*/
window.onload = function () {
    canvas.width = 600;
    canvas.height = 600;
    document.querySelector('.editor__interact').appendChild(canvas);
    canvas.oncontextmenu=function(){return false;};

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
    gl.polygonOffset(1.0,1.0);

    editorMode = false; //активируем режим простоя для редактора (нельзя рисовать)
    set2D();
    setStage();
}

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
    u_LightColor = gl.getUniformLocation(shaderProgram, 'u_LightColor');
    u_LightPosition = gl.getUniformLocation(shaderProgram, 'u_LightPosition');
    u_AmbientLight = gl.getUniformLocation(shaderProgram, 'u_AmbientLight');

    if (!u_ModelMatrix || !u_MvpMatrix || !u_NormalMatrix || !u_LightColor || !u_LightPosition || !u_AmbientLight) {
        console.log('Failed to get the storage location');
        return;
    }

    gl.uniform3f(u_LightColor, 1.0, 1.0, 1.0);
    gl.uniform3f(u_LightPosition, -2.0, -3.0, 2.0);
    gl.uniform3f(u_AmbientLight, 0.2, 0.2, 0.2);
}

function draw() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    //оси координат
    vertexArray = [
        0, 0, 0, 1, 0, 0, //x (red)
        0, 0, 0, 0, 1, 0, //y (grey)
        0, 0, 0, 0, 0, 1, //z (green)
    ];


    let count = vertexArray.length / 3;
    colors = [];
    for (let i=0; i<vertexArray/3; i++) {
        colors.push(0,0,0);
    }
    if (!initArrayBuffer(gl, 'a_Position', new Float32Array(vertexArray), 3)) return -1;
    if (!initArrayBuffer(gl, 'a_Color', new Float32Array(colors), 3)) return -1;

    gl.drawArrays(gl.LINES, 0, count);
    modelMatrix.pushMatrix();

    for (obj in scene.house) {  
        let dx = scene.house[obj].translation[0];
        let dy = scene.house[obj].translation[1];
        let dz = scene.house[obj].translation[2];
        modelMatrix.translate(dx, dy, dz);   
        setMatrixUniforms();
        if (viewMode === '2d') {
            drawScheme(scene.house[obj].vertices, false, scene.house[obj].height, [0,0,0]);
        } else {
            drawObject(scene.house[obj].vertices, scene.house[obj].height, scene.house[obj].color);
        }
    }

    modelMatrix.popMatrix();
    setMatrixUniforms();
}

function clearViewport() {
    vertexArray = [];
    exampleVertices = [];
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function convertToCoor(val) {
    return val * (canvas.width/20) / (canvas.width/2);
}

function drawShapeDown(event, obj) {
    if (event.which == 1) {
        let x = event.clientX;
        let y = event.clientY;

        let middle_X = gl.canvas.width / 2;
        let middle_Y = gl.canvas.height / 2;

        let rect = canvas.getBoundingClientRect();

        x = ((x - rect.left) - middle_X) / middle_X;
        y = (middle_Y - (y - rect.top)) / middle_Y;

        xc = x;
        yc = y;

        obj.vertices.push(x, y);

        drawClick = true;

    } else if (event.which == 3) {
        if (drawClick === true) {
            obj.vertices.pop();
            obj.vertices.pop();
        }
        x=obj.vertices[0];
        y=obj.vertices[1];
        obj.vertices.push(x, y);
        drawClick = false;
        drawEditor(obj);
        draw();
    }
}

function drawShapeMove(event, obj) {
    if (drawClick === true) {

        let x = event.clientX;
        let y = event.clientY;

        let middle_X = gl.canvas.width / 2;
        let middle_Y = gl.canvas.height / 2;

        let rect = canvas.getBoundingClientRect();

        x = ((x - rect.left) - middle_X) / middle_X;
        y = (middle_Y - (y - rect.top)) / middle_Y;

        let len = obj.vertices.length;

        if (len%4===0) {
            obj.vertices.pop();
            obj.vertices.pop();
        }
        obj.vertices.push(x, y);
        draw();
    }
}

function initArrayBuffer(gl, attribute, data, num) {
    // Create a buffer object
    let buffer = gl.createBuffer();
    if (!buffer) {
        console.log('Failed to create the buffer object');
        return false;
    }
    // Write date into the buffer object
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    // Assign the buffer object to the attribute variable
    let a_attribute = gl.getAttribLocation(shaderProgram, attribute);
    if (a_attribute < 0) {
        console.log('Failed to get the storage location of ' + attribute);
        return false;
    }
    gl.vertexAttribPointer(a_attribute, num, gl.FLOAT, false, 0, 0);
    // Enable the assignment of the buffer object to the attribute variable
    gl.enableVertexAttribArray(a_attribute);

    return true;
}

// новый вариант построения фигуры с применением цвета и нормалей
function drawObject(vertices, height, texture) {
    colors = [];
    normals = [];
    indices = [];

    vertexArray = [];

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
        vertexArray.push(vertices[i], vertices[i + 1], k % 2 === 0 ? 0.0 : convertToCoor(height)); //A, B, ...
        k++;
        vertexArray.push(vertices[i], vertices[i + 1], k % 2 === 0 ? 0.0 : convertToCoor(height)); //A0, B0, ...
        k++;
        vertexArray.push(vertices[i + 2], vertices[i + 3], k % 2 === 0 ? 0.0 : convertToCoor(height)); //B, C, ...
        k++;
        vertexArray.push(vertices[i + 2], vertices[i + 3], k % 2 === 0 ? 0.0 : convertToCoor(height)); //B0, C0, ...
        k++;
    }

    //цвета вершин
    for (let i = 0; i < vertexArray.length / 3; i++) {
        colors.push(texture[0], texture[1], texture[2]);
    }
    //нормали в вершинах
    normals = getNormals(vertices, '3d');

    if (!initArrayBuffer(gl, 'a_Position', new Float32Array(vertexArray), 3)) return -1;
    if (!initArrayBuffer(gl, 'a_Color', new Float32Array(colors), 3)) return -1;
    if (!initArrayBuffer(gl, 'a_Normal', new Float32Array(normals), 3)) return -1;

    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    //    1------ 3
    //   /|      /|
    //  7-------5 |
    //  | |     | |
    //  | |0----|-|2
    //  |/      |/
    //  6-------4
    // Coordinates

    //индексы
    for (let i = 0; i < vertexArray.length / 3 - 3; i += 4) {
        indices.push(i, i + 1, i + 2, i + 1, i + 2, i + 3);
        //0, 1, 2, 1, 2, 3,
        //4,5,6, 5,6,7, ...
    }

    let indexBuffer = gl.createBuffer();
    if (!indexBuffer) {
        console.log('Failed to create the buffer object');
        return false;
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array(indices), gl.STATIC_DRAW);

    let n = indices.length;
    gl.drawElements(gl.TRIANGLES, n, gl.UNSIGNED_BYTE, 0);

    drawScheme(vertices, true, height, texture);
}

function drawScheme(vertices, fill, height, texture) {
    colors = [];
    normals = [];
    indices = [];
    vertexArray = [];
    let innerVertex = [];
    let averageVertex = [0, 0];
    //вершины
    for (let i = 0; i < vertices.length; i++) {
        vertexArray.push(vertices[i]);
        if (i % 2 === 1) {
            vertexArray.push(convertToCoor(height));
        }
    }

    //цвета вершин
    for (let i = 0; i < vertexArray.length / 3; i++) {
        colors.push(texture[0], texture[1], texture[2]);
    }

    //нормали
    normals = getNormals(vertices, '2d');

    if (fill) {
        for (let i = 1; i < normals.length / 3 - 1; i += 2) {
            let v1 = [normals[i * 3], normals[i * 3 + 1]];
            let v2 = [normals[(i + 1) * 3], normals[(i + 1) * 3 + 1]];
            let cos = vectorAngle(v1, v2);
            if (cos <= 0 && cos > -1) {
                let num = (i + 1) / 2;
                innerVertex.push(vertexArray[num * 3], vertexArray[num * 3 + 1]);
            }
        }

        let len = normals.length;
        let v1 = [normals[0], normals[1]];
        let v2 = [normals[len - 3], normals[len - 2]];
        let cos = vectorAngle(v1, v2);

        if (cos <= 0 && cos > -1) {
            innerVertex.push(vertexArray[0], vertexArray[1]);
        }

        for (let i = 0; i < innerVertex.length; i += 2) {
            averageVertex[0] += innerVertex[i];
            averageVertex[1] += innerVertex[i + 1];
        }
        averageVertex[0] /= innerVertex.length / 2;
        averageVertex[1] /= innerVertex.length / 2;

        if (innerVertex.length > 0) {
            vertexArray.unshift(averageVertex[0], averageVertex[1], convertToCoor(height));
        }

        normals = [];
        for (let i = 0; i < vertexArray.length / 3; i++) {
            normals.push(0, 0, 1);
        }

        colors = [];
        for (let i = 0; i < vertexArray.length / 3; i++) {
            colors.push(texture[0], texture[1], texture[2]);
        }
    }

    if (!initArrayBuffer(gl, 'a_Position', new Float32Array(vertexArray), 3)) return -1;
    if (!initArrayBuffer(gl, 'a_Color', new Float32Array(colors), 3)) return -1;
    if (!initArrayBuffer(gl, 'a_Normal', new Float32Array(normals), 3)) return -1;

    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    //индексы
    for (let i = 0; i < vertexArray.length; i += 3) {
        indices.push(i / 3);
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
    if (fill) {
        gl.drawElements(gl.TRIANGLE_FAN, n, gl.UNSIGNED_BYTE, 0);
    } else {
        gl.drawElements(gl.LINE_STRIP, n, gl.UNSIGNED_BYTE, 0);
    }
}

function setStage() {
    let interviewDiv = document.querySelector('.interview div'); //поле для опроса в котором будет меняться информация
    let stageNumber=0; //отслеживание номера стадии
    
    const stageInfo = document.querySelectorAll ('.stageDescriptions>div'); //описание для каждой стадии (заголовок, описнаие и требуемые действия)
    const previousBtn = document.querySelector('.interview .previousStage');
    const nextBtn = document.querySelector('.interview .nextStage');
    const shapeMenu = document.querySelector('#shape');

    interviewDiv.innerHTML = stageInfo[0].innerHTML;
    previousBtn.setAttribute('disabled', true);
    shapeMenu.setAttribute('disabled', true);

    checkStage = function() {
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
                shapeMenu.removeAttribute('disabled');
            
                break;
            case 1: //возведение стен
                if (!scene.house.outerWalls) {
                    scene.house.outerWalls = new sceneObject('outerWalls');
                }
                break;
        }
        createModel();
    }

    checkStage();

    previousBtn.onclick = function() {
        if (stageNumber>=0) {
            stageNumber--;            
            interviewDiv.innerHTML = stageInfo[stageNumber].innerHTML;
            nextBtn.removeAttribute('disabled');
        } 
        if (stageNumber === 0) {
            this.setAttribute('disabled', true);
        }
        checkStage();
    }

    nextBtn.onclick = function() {
        if (stageNumber<stageInfo.length-1) {
            stageNumber++;
            interviewDiv.innerHTML = stageInfo[stageNumber].innerHTML;
            previousBtn.removeAttribute('disabled');
        } 
        if (stageNumber === stageInfo.length-1) {
            this.setAttribute('disabled', true);
        }
        shapeMenu.setAttribute('disabled', true);
        checkStage();
    }
}

function createModel() {
    let heightInput;
    let basement = scene.house.basement;
    let outerWalls = scene.house.outerWalls;

    let clearBtn = document.querySelector('.editor__functions button');
    clearBtn.onclick = function() {
        for (obj in scene.house) {
            clearObj(scene.house[obj]);
        }
        draw();
    }

    if (basement) {
        //получение вершин
        const shapeMenu = document.querySelector('#shape');
        let shapeNumber = shapeMenu.selectedOptions[0].value;
        let numberOfShapes = exampleShapes.length;
        
        if (shapeNumber < numberOfShapes) {
            basement.vertices = exampleShapes[shapeNumber]; //берется заготовленный вариант
            clearBtn.setAttribute('disabled', true);
        } else {
            clearBtn.removeAttribute('disabled'); 
            drawEditor(basement);
        }

        shapeMenu.onchange = function () {
            if (shapeMenu.selectedOptions[0].value>=numberOfShapes) {
                set2D();
            } else {
                createModel();
            }
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
    
        outerWalls.vertices = basement.vertices;
        outerWalls.color = [0.8, 0, 0];
        outerWalls.translation = [0, 0, convertToCoor(basement.height)];
    }

    draw();
}

function clearObj(obj) {
    obj.vertices = [];
    obj.height = 0;
    obj.color = [0, 0, 0];
    obj.translation = [0, 0, 0];
}


function setMatrixUniforms() {
    mvpMatrix.set(perspectiveMatrix);
    mvpMatrix.multiply(viewMatrix);
    mvpMatrix.multiply(modelMatrix);
    gl.uniformMatrix4fv(u_MvpMatrix, false, mvpMatrix.elements);
    gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);
    gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);
}

function set2D() {
    modelMatrix.setIdentity();
    viewMatrix.setIdentity();
    perspectiveMatrix.setIdentity();
    normalMatrix.setIdentity();
    normalMatrix.setInverseOf(modelMatrix);
    normalMatrix.transpose();
    setMatrixUniforms();
    viewMode = '2d';
    createModel();
    disableViewButtons();
}

function set3D() {
    perspectiveMatrix.setPerspective(30, canvas.width / canvas.height, 1, 100);
    viewMatrix.lookAt(-3, -3, 1.5, 0, 0, 0, 0, 0, 1);
    normalMatrix.setIdentity();
    normalMatrix.setInverseOf(modelMatrix);
    normalMatrix.transpose();
    setMatrixUniforms();
    viewMode = '3d';
    createModel();
    enableViewButtons();
}

function drawEditor(obj) {
    editorMode=(!editorMode);
    if (editorMode===false) {
        canvas.onmousedown = function() {return false;}
        canvas.onmousemove = function() {return false;}
    } else {
        canvas.onmousedown = function() {
            drawShapeDown(event, obj);
        }
        canvas.onmousemove = function() {
            drawShapeMove(event, obj);
        }
    }
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
        let k;
        if (mode === '2d') {
            k = 2;
        } else {
            k = 4;
        }
        for (let i = 0; i < k; i++) {
            normals.push(n.x, n.y, 0.0);
        }
    }
    return normals;
}

function flipNormals(normals) {
    for (let i = 0; i < normals.length; i++) {
        if (normals[i] !== 0) {
            normals[i] = -normals[i];
        }
    }
}

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


