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
    '  if(u_PickedVertex == 0) {\n' +
    '    v_Color = vec4(color, a_Vertex/255.0);\n' +
    '  } else {\n' +
    '    v_Color = vec4(color, 1.0);\n' +
    '  }\n' +
    '  if (u_PointsMode) {\n' +
    '    v_Pick=1.0;\n' +
    '  } else {\n' +
    '    v_Pick=0.0;\n' +
    '  }\n' +
    // '  v_Color = a_Color;\n' +
    '  gl_PointSize = 7.0;\n' +
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

let a_Position;
let a_Color;
let a_normal;
let u_MvpMatrix;
let u_ModelMatrix;
let u_NormalMatrix;
let u_LightColor;
let u_LightDirection;
let u_AmbientLight;
let u_PickedVertex;
let u_PointsMode;

let viewMode; //режим показа - 2D/3D
let editorMode; //режим работы редактора - если true, то можно выполнять построения, если false - то только просмотр
let modelingStage; //стадия моделирования
let currentAngle = 0;

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
    canvas.width = 600;
    canvas.height = 600;
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
    set2D();
    setStage();
    drawButtons();
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
    u_LightColor = gl.getUniformLocation(shaderProgram, 'u_LightColor');
    u_LightPosition = gl.getUniformLocation(shaderProgram, 'u_LightPosition');
    u_AmbientLight = gl.getUniformLocation(shaderProgram, 'u_AmbientLight');
    u_PickedVertex = gl.getUniformLocation(shaderProgram, 'u_PickedVertex');
    u_PointsMode = gl.getUniformLocation(shaderProgram, 'u_PointsMode');


    if (!u_ModelMatrix || !u_MvpMatrix || !u_NormalMatrix || !u_LightColor || !u_LightPosition || !u_AmbientLight) {
        console.log('Failed to get the storage location');
        return;
    }

    gl.uniform3f(u_LightColor, 1.0, 1.0, 1.0);
    gl.uniform3f(u_LightPosition, -2.0, -3.0, 3.0);
    gl.uniform3f(u_AmbientLight, 0.2, 0.2, 0.2);
    gl.uniform1i(u_PickedVertex, -1); //-1 - нет щелчка, 0 - щелчок, 1,2,3,... - номер вершины/объекта
    gl.uniform1i(u_PointsMode, 0); //0 - не точки, 1 - точки
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
    gl.uniform1i(u_PointsMode, 0);
    //оси координат
    vertexArray = [
        0.0, 0.0, 0.0, 1.0, 0.0, 0.0, //x (red)
        0.0, 0.0, 0.0, 0.0, 1.0, 0.0, //y (grey)
        0.0, 0.0, 0.0, 0.0, 0.0, 1.0, //z (green)
    ];


    let count = vertexArray.length / 3;
    colors = [];
    for (let i = 0; i < vertexArray / 3; i++) {
        colors.push(0.0, 0.0, 0.0);
    }
    if (!initArrayBuffer(gl, 'a_Position', new Float32Array(vertexArray), 3)) return -1;
    if (!initArrayBuffer(gl, 'a_Color', new Float32Array(colors), 3)) return -1;
    gl.drawArrays(gl.POINTS, 0, count);
    
    modelMatrix.pushMatrix();

    for (obj in scene.house) {
        if (obj !== 'floors') {
            let dx = scene.house[obj].translation[0];
            let dy = scene.house[obj].translation[1];
            let dz = scene.house[obj].translation[2];
            modelMatrix.translate(dx, dy, dz);
            setMatrixUniforms();
            if (viewMode === '2d') {
                drawScheme(scene.house[obj].vertices, 0, [0, 0, 0], false);
                if (scene.house[obj].height > 0) {
                    drawScheme(scene.house[obj].innerVertices, 0, [0, 0, 0], false);
                }
                if (editorMode) {
                    drawPoints(scene.house[obj].vertices, [0, 0, 0]);
                }
            } else if (obj === 'outerWalls') {
                for (let i = 0; i < scene.house.floors - 1; i++) {
                    drawWalls(scene.house[obj]);
                    modelMatrix.translate(0, 0, scene.house[obj].height);
                    setMatrixUniforms();
                    drawObject(scene.house[obj].vertices, scene.house.basement.height / 2, scene.house.basement.color, 'fan', false);
                    modelMatrix.translate(0, 0, scene.house.basement.height / 2);
                    setMatrixUniforms();
                }
                drawWalls(scene.house[obj]);
            } else {
                drawObject(scene.house[obj].vertices, scene.house[obj].height, scene.house[obj].color, 'fan', false);
            }
        }
    }

    modelMatrix.popMatrix();
    setMatrixUniforms();
}

function drawObject(vertices, height, texture, fill, flip) {
    gl.uniform1i(u_PointsMode, 0);
    if (vertices) {
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
        // if (flip) {
        //     normals = flipNormals(normals);
        // }

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
        if (flip) {
            for (let i = 0; i < vertexArray.length / 3 - 3; i += 4) {
                indices.push(i + 2, i + 1, i, i + 3, i + 2, i + 1);
                //0, 1, 2, 1, 2, 3,
                //4,5,6, 5,6,7, ...
            }
        } else {
            for (let i = 0; i < vertexArray.length / 3 - 3; i += 4) {
                indices.push(i, i + 1, i + 2, i + 1, i + 2, i + 3);
                //0, 1, 2, 1, 2, 3,
                //4,5,6, 5,6,7, ...
            }
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

        if (fill) {
            drawScheme(vertices, height, texture, 'fan');
        }
    } else {
        return;
    }

}

function drawScheme(vertices, height, texture, fill) {
    gl.uniform1i(u_PointsMode, 0);
    if (vertices) {
        colors = [];
        normals = [];
        indices = [];
        vertexArray = [];
        //вершины
        for (let i = 0; i < vertices.length; i++) {
            vertexArray.push(vertices[i]);
            if (i % 2 === 1) {
                vertexArray.push(height);
            }
        }

        //цвета вершин
        for (let i = 0; i < vertexArray.length / 3; i++) {
            colors.push(texture[0], texture[1], texture[2]);
        }

        //нормали
        normals = getNormals(vertices, '2d');

        if (fill) {
            if (fill === 'fan') {
                //добавление центра многоугольника для закрашивания веером
                let center = getPolygonCenter(vertices);
                vertexArray.unshift(center[0], center[1], height);
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
    let vertexNumber = [];
    for (let i = 1; i <= vertices.length / 2; i++) {
        vertexNumber.push(i);
    }
    let vertexArray = [];
    for (let i = 0; i < vertices.length; i += 2) {
        vertexArray.push(vertices[i], vertices[i + 1], 0.5); //A, B, ...
    }
    colors = [];
    for (let i = 0; i < vertices.length / 2; i++) {
        colors.push(0.0, 0.0, 0.0);
    }

    if (!initArrayBuffer(gl, 'a_Position', new Float32Array(vertexArray), 3)) return -1;
    if (!initArrayBuffer(gl, 'a_Color', new Float32Array(colors), 3)) return -1;
    if (!initArrayBuffer(gl, 'a_Vertex', new Float32Array(vertexNumber), 1)) return -1;
    gl.drawArrays(gl.POINTS, 0, vertices.length / 2);
}

function drawWalls(obj) {
    if (obj.innerVertices.length > 0 && obj.height > 0) {
        //внешние
        drawObject(obj.vertices, obj.height, obj.color, false, false);
        //внутренние
        drawObject(obj.innerVertices, obj.height, obj.color, false, false);
        //верх
        drawScheme(obj.getUpVertices(), obj.height, obj.color, 'strip');
    }
}
/*---------------------------КОНЕЦ РИСОВАНИЕ ФИГУР-----------------------------------------*/


/*---------------------------ОТСЛЕЖИВАНИЕ СТАДИИ ОПРОСА И СОЗДАНИЕ МОДЕЛИ-----------------------------------------*/
function setStage() {
    let interviewDiv = document.querySelector('.interview div'); //поле для опроса в котором будет меняться информация
    let stageNumber = 0; //отслеживание номера стадии

    const stageInfo = document.querySelectorAll('.stageDescriptions>div'); //описание для каждой стадии (заголовок, описнаие и требуемые действия)
    const previousBtn = document.querySelector('.interview .previousStage');
    const nextBtn = document.querySelector('.interview .nextStage');
    const shapeMenu = document.querySelector('#shape');
    const numberOfShapes = exampleShapes.length;

    let shapeBtn = document.querySelectorAll('.editor__functions button');
    interviewDiv.innerHTML = stageInfo[0].innerHTML;
    previousBtn.setAttribute('disabled', true);

    shapeMenu.setAttribute('disabled', true);
    shapeMenu.onchange = function () {
        let shapeNumber = shapeMenu.selectedOptions[0].value;
        if (shapeNumber < numberOfShapes) {
            shapeBtn.forEach(btn => {
                btn.style.display = 'none';
            });
        } else {
            shapeBtn.forEach(btn => {
                btn.style.display = 'block';
            });
        }
    }

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
                shapeMenu.removeAttribute('disabled');
                if (!(shapeMenu.selectedOptions[0].value < numberOfShapes)) {
                    shapeBtn.forEach(btn => {
                        btn.style.display = 'block';
                    });
                }
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

    previousBtn.onclick = function () {
        if (stageNumber >= 0) {
            stageNumber--;
            interviewDiv.innerHTML = stageInfo[stageNumber].innerHTML;
            nextBtn.removeAttribute('disabled');
        }
        if (stageNumber === 0) {
            this.setAttribute('disabled', true);
        }
        checkStage();
    }

    nextBtn.onclick = function () {
        if (stageNumber < stageInfo.length - 1) {
            stageNumber++;
            interviewDiv.innerHTML = stageInfo[stageNumber].innerHTML;
            previousBtn.removeAttribute('disabled');
        }
        if (stageNumber === stageInfo.length - 1) {
            this.setAttribute('disabled', true);
        }
        shapeMenu.setAttribute('disabled', true);
        shapeBtn.forEach(btn => {
            btn.style.display = 'none';
        });
        checkStage();
    }
}

function createModel() {
    let heightInput;
    let basement = scene.house.basement;
    let outerWalls = scene.house.outerWalls;

    if (basement) {
        //получение вершин
        const shapeMenu = document.querySelector('#shape');
        const numberOfShapes = exampleShapes.length;
        let shapeNumber = shapeMenu.selectedOptions[0].value;

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

    //этажи
    let floorNumbers = document.querySelector(".interview div #floors");
    let floorMenu = document.querySelector(".stageDescriptions .stageFloors #floors");
    if (floorNumbers) {
        scene.house.floors = Number(floorNumbers.selectedOptions[0].value);
        // floorMenu.options.forEach((opt) => {
        //     if (floorNumbers.selectedOptions[0]===opt) {
        //         opt.setAttribute('selected', true);
        //     } else {
        //         opt.removeAttribute('selected');
        //     }
        // });
        floorMenu.selectedOptions = floorNumbers.selectedOptions;
        floorNumbers.onchange = function () {
            createModel();
        }
    } else {
        scene.house.floors = 1;
    }
    draw();
}

function clearObj(obj) {
    obj.vertices = [];
    obj.height = 0;
    obj.color = [0, 0, 0];
    obj.translation = [0, 0, 0];
}
/*---------------------------КОНЕЦ ОТСЛЕЖИВАНИЕ СТАДИИ ОПРОСА И СОЗДАНИЕ МОДЕЛИ-----------------------------------------*/



/*---------------------------УСТАНОВКА ВИДА-----------------------------------------*/
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
    let basement = scene.house.basement;
    let shapeBtn = document.querySelectorAll('.editor__functions button');

    let createBtn = shapeBtn[0];
    let editBtn = shapeBtn[1];
    let clearBtn = shapeBtn[2];

    if (basement.vertices.length > 0) {
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
            drawEditor(basement, createBtn);
            createBtn.innerHTML = 'Закончить';
        } else {
            createBtn.innerHTML = 'Построить';
            shapeBtn.forEach(btn => {
                if (btn !== createBtn) {
                    btn.removeAttribute('disabled');
                }
            });
            drawEditor(basement, createBtn);
            gl.uniform1i(u_PickedVertex, -1);
            draw();
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
            drawEditor(basement, editBtn);
            draw();
            editBtn.innerHTML = 'Закончить';
        } else {
            editBtn.innerHTML = 'Редактировать';
            shapeBtn.forEach(btn => {
                if (btn !== editBtn) {
                    btn.removeAttribute('disabled');
                }
            });
            drawEditor(basement, editBtn);
            draw();
        }
        drawButtons();
    }

    clearBtn.onclick = function () {
        for (obj in scene.house) {
            clearObj(scene.house[obj]);
        }
        draw();
        drawButtons();
    }
}

function drawEditor(obj, btn) {
    editorMode = (!editorMode);
    if (editorMode) {
        if (btn.innerHTML === 'Построить') {
            canvas.onmousedown = function (event) {
                drawShapeDown(event, obj);
            }
            canvas.onmousemove = function (event) {
                drawShapeMove(event, obj);
            }
        } else
        if (btn.innerHTML === 'Редактировать') {
            canvas.onmousedown = function (event) {
                changeShapeDown(event, obj);
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
        gl.uniform1i(u_PickedVertex, -1);
        draw();
    }
}

let drawClick = 0; //отслеживание клика при рисовании

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
        draw();
        drawClick++;

    } else if (event.which == 3) {
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

function drawShapeMove(event, obj) {
    if (drawClick > 0) {

        let x = event.clientX;
        let y = event.clientY;

        let middle_X = gl.canvas.width / 2;
        let middle_Y = gl.canvas.height / 2;

        let rect = canvas.getBoundingClientRect();

        x = ((x - rect.left) - middle_X) / middle_X;
        y = (middle_Y - (y - rect.top)) / middle_Y;

        let len = obj.vertices.length;

        if (len / 2 % (drawClick + 1) === 0) {
            obj.vertices.pop();
            obj.vertices.pop();
        }
        obj.vertices.push(x, y);
        draw();
    }
}

function changeShapeDown(event, obj) {
    if (event.which == 1) {
        let x = event.clientX,
            y = event.clientY;
        let rect = canvas.getBoundingClientRect();
        if (rect.left <= x && x < rect.right && rect.top <= y && y < rect.bottom) {
            x = x - rect.left;
            y = rect.bottom - y;
            let vertex = checkVertex(x, y, u_PickedVertex);
            gl.uniform1i(u_PickedVertex, vertex);
            draw();
            drawClick++;
            canvas.onmousemove = function (event) {
                changeShapeMove(event, obj, vertex);
            }
            canvas.onmouseup = function () {
                drawClick = 0;
            }
        }
    } else if (event.which == 3) {
        gl.uniform1i(u_PickedVertex, -1);
        draw();
        drawClick = 0;
    }
}

function changeShapeMove(event, obj, num) {
    if (drawClick > 0) {
        // let num = checkVertex(x, y, u_PickedVertex); 
        if (num < obj.vertices.length / 2) {
            let x = event.clientX;
            let y = event.clientY;

            let middle_X = gl.canvas.width / 2;
            let middle_Y = gl.canvas.height / 2;

            let rect = canvas.getBoundingClientRect();

            x = ((x - rect.left) - middle_X) / middle_X;
            y = (middle_Y - (y - rect.top)) / middle_Y;

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

/*---------------------------КОНЕЦ СОЗДАНИЕ И РЕДАКТИРОВАНИЕ ФОРМЫ-----------------------------------------*/

/*---------------------------ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ-----------------------------------------*/
function convertToCoor(val) {
    return val * (canvas.width / 20) / (canvas.width / 2);
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
    console.log(normals);
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

function getArea(vertices) {
    let s = 0;
    for (let i = 0; i < vertices.length - 2; i += 2) {
        s += vertices[i] * vertices[i + 3] - vertices[i + 1] * vertices[i + 2]; //x1*y2-x2*y1
    }
    return s / 2;
}

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

function checkSymmetry(vertices) {
    let sumLeft = 0,
        sumRight = 0;
    for (let i = 0; i < vertices.length; i += 2) {
        if (vertices[i] > 0) {
            sumLeft += vertices[i];
        } else {
            sumRight += vertices[i];
        }
    }
    if (Math.abs(sumRight) <= Math.abs(sumLeft) * 1.1 && Math.abs(sumRight) >= Math.abs(sumLeft) * 0.9) {
        return true;
    } else {
        return false;
    }
}

function getInnerVertices(vertices, width) {
    let result = [];
    let innerVertices = [];
    for (let i = 2; i < vertices.length - 2; i += 2) {
        result = getIntro(vertices[i - 2], vertices[i - 1], vertices[i], vertices[i + 1], vertices[i + 2], vertices[i + 3], width);
        innerVertices.push(result[0], result[1]);
    }
    let len = vertices.length;
    result = getIntro(vertices[len - 4], vertices[len - 3], vertices[0], vertices[1], vertices[2], vertices[3], width);
    innerVertices.unshift(result[0], result[1]);
    innerVertices.push(result[0], result[1]);
    return innerVertices;
}

function getIntro(x1, y1, x2, y2, x3, y3, width) {
    let a = [],
        b = [],
        c = [],
        d = [];
    a.push(x1 - x2, y1 - y2);
    let absA = absVector(a);
    a[0] = a[0] / absA;
    a[1] = a[1] / absA;
    b.push(x3 - x2, y3 - y2);
    let absB = absVector(b);
    b[0] = b[0] / absB;
    b[1] = b[1] / absB;
    c.push(a[0] + b[0], a[1] + b[1]);
    if ((-a[0] * b[1] - b[0] * (-a[1])) > 0) {
        c[0] = -c[0];
        c[1] = -c[1];
    }

    let cos = vectorAngle(a, b);
    let sin = Math.sqrt((1 - cos) / 2);
    width = width / sin;
    k = width * Math.sqrt(2 / (Math.pow(c[0], 2) + Math.pow(c[1], 2)));
    d.push(k * c[0], k * c[1]);
    d[0] = d[0] + x2;
    d[1] = d[1] + y2;
    return d;
}

function absVector(a) {
    return Math.sqrt(a[0] * a[0] + a[1] * a[1]);
}
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
    if (!editorMode) {
        let dragging = false;
        let lastX, lastY;
        canvas.onmousedown = function (ev) {
            let x = ev.clientX;
            let y = ev.clientY;
            let rect = ev.target.getBoundingClientRect();

            if (rect.left <= x && x < rect.right && rect.top <= y && y < rect.bottom) {
                lastX = x;
                lastY = y;
                dragging = true;
            }
            canvas.onmousemove = function (ev) {
                let x = ev.clientX;
                let y = ev.clientY;

                if (dragging) {
                    let factorX = 1 / 120; // The rotation ratio
                    let factorY = 0.005; // The rotation ratio
                    let dx = factorX * (x - lastX);
                    let dy = factorY * (y - lastY);
                    // dy должен меняться от
                    // currentAngle должен меняться от -1 до 2.5 
                    currentAngle[0] += dx;
                    currentAngle[1] = Math.max(Math.min(currentAngle[1] + dy, 2.5), -1);
                    console.log(currentAngle[1]);
                }
                lastX = x;
                lastY = y;

                modelMatrix.rotate(currentAngle[0], 0, 0, 1);
                // viewMatrix.lookAt(-3, -3, Math.max(Math.min(currentAngle[1]+1.5, 4), 0.5), 0, 0, 0, 0, 0, 1);
                // viewMatrix.rotate(currentAngle[1], 1, 0, 0);
                //
                setMatrixUniforms();
                draw();
            }
        }
        canvas.onmouseup = function (ev) {
            canvas.onmousemove = function () {
                return false;
            }
            currentAngle = [0, 0];
        }
        let tick = function () { // Start drawing
            draw();
            requestAnimationFrame(tick, canvas);
        };
        tick();
    }
}
/*---------------------------КОНЕЦ РАБОТА С ВИДОМ НА МОДЕЛЬ-----------------------------------------*/
