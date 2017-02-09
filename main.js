var prgString = `
    let x = 100;
    
    let test = (x)=>{
        let printN = (x)=>{
            -- x >= 0;
            
            ffi console.log(x);
        };
        
        printN(x);
    };
    
    test(x);
`;

function output(x){
    if ( typeof document != undefined )
        outputArea.innerHTML += "</br>"+x;
    else
        log(x);
}

function logJ(a){
    console.log(JSON.stringify(a));
}
function log(a){
    console.log(a);
}

function newVar(name,value) {
    return { name : name
           , meta : { value : value }
           };
}

function mkScopes(scope,scopes) {
    var ss = [];
    for ( var i = 0 ; i < scopes.length ; i++ )
        ss.push(scopes[i]);
    ss.splice(0,0,scope);
    return ss;
}

function compile(prg) {
    return compileWithScope(prg,{},[]);
}

function compileWithScope(prg,scope,scopes) {
    var code = "";
    
    var findInScope = function(name) {
        if ( scope[name] )
            return scope[name];
        for ( var i = 0 ; i < scopes.length ; i++ ) {
            if ( scopes[i][name] )
                return scopes[i][name];
        }
    }
    
    for (var i = 0 ; i < prg.length ; i++) {
        var ins = prg[i];
        
        if ( ins.type == "let" ) {
            scope[ins.name] = newVar(ins.name,ins.value);
            code += `var ${ins.name} = ${ins.value};\n`;
        }
        else if ( ins.type == "letf" ) {
            scope[ins.name] = newVar(ins.name,ins.value);
            var fScope = {};
            for ( var p = 0 ; p < ins.value.params.length ; p++ ) {
                fScope[ins.value.params[p]] = newVar(ins.value.params[p],null);
            }
            var funcCode = compileWithScope(ins.value.body,fScope,[]);
            if ( funcCode.error )
                return funcCode;
            else {
                var l = funcCode.code.split("\n");
                l.splice(l.length-1,1);
                funcCode.code = "    " + l.join("\n    ");
                code += `function ${ins.name}(${ins.value.params.join(",")}) {\n${funcCode.code}\n}\n`;
            }
        }
        else if ( ins.type == "+=" ) {
            findInScope(ins.var).meta.value += ins.value;
            code += `${ins.var} += ${ins.value};\n`;
        }
        else if ( ins.type == "ffi" ) {
            code += `${ins.func}(${ins.params.join(",")});\n`;
        }
        else if ( ins.type == "fCall" ) {
            var func = findInScope(ins.func);
            if ( !func )
                return {error : `Can't find function ${ins.func}`};
            
            for ( var p = 0 ; p < func.meta.value.meta.length ; p++ ) {
                var s = func.meta.value.meta[p];
                
                var findVar = function(name) {
                   return findInScope( ins.params[ func.meta.value.params.indexOf(name) ] );
                }
                
                if ( s.type == "cond" ) {
                    if ( findVar(s.var).meta.value == null )
                        return { error : `Error with var ${s.var}, should be >= ${s.value} but is not of a known value at that point` };
                    if ( s.cond == ">=" ) {
                        if (!(findVar(s.var).meta.value >= s.value))
                            return { error : `Error with var ${s.var}, should be >= ${s.value} but is ${findVar(s.var).meta.value}` };
                    }
                    else if ( s.cond == ">" ) {
                        if (!(findVar(s.var).meta.value > s.value))
                            return { error : `Error with var ${s.var}, should be > ${s.value} but is ${findVar(s.var).meta.value}` };
                    }
                    else if ( s.cond == "<=" ) {
                        if (!(findVar(s.var).meta.value <= s.value))
                            return { error : `Error with var ${s.var}, should be <= ${s.value} but is ${findVar(s.var).meta.value}` };
                    }
                    else if ( s.cond == "<" ) {
                        if (!(findVar(s.var).meta.value < s.value))
                            return { error : `Error with var ${s.var}, should be < ${s.value} but is ${findVar(s.var).meta.value}` };
                    }
                    else if ( s.cond == "==" ) {
                        if (!(findVar(s.var).meta.value == s.value))
                            return { error : `Error with var ${s.var}, should be == ${s.value} but is ${findVar(s.var).meta.value}` };
                    }
                    else if ( s.cond == "!=" ) {
                        if (!(findVar(s.var).meta.value != s.value))
                            return { error : `Error with var ${s.var}, should be != ${s.value} but is ${findVar(s.var).meta.value}` };
                    }
                }
            }
            
            code += `${func.name}(${ins.params.join(",")});\n`;
        }
    }
    
    return {code : code};
}























function mkR(c,r) {
    var l = [c,r];
    l.mapR = function(f){
        return [this[0],f(this[1])];
    };
    return l;
}

function mkP(f) {
    f.mapR = function(ff){
        return function(c){ var r = f(c); return r==null?null:r.mapR(ff); };
    };
    return f;
}

function parseThing(str,parser) {
    let c = { index : 0 , str : str };
    return parser(c);
}

function takeString(str) {
    return mkP(function(c) {
        if ( c.str.substr(c.index,str.length) == str )
            return mkR({ index : c.index+str.length , str : c.str }, str);
        else
            return null;
    });
}

function orP(ps) {
    return mkP(function(c){
        for (var i = 0 ; i < ps.length ; i++) {
            var r = ps[i](c);
            if ( r != null )
                return r;
        }
        return null;
    });
}

function withoutWhite(p) {
    return mkP(function(c){
        var nls = parseWhiteSpaces(c);
        if ( nls != null ) c = nls[0];
        
        return p(c);
    });
}

function manyP(p) {
    return mkP(function(c){
        var rs = [];
        var nc = null;
        for (;;) {
            nc = p(c);
            if ( nc == null )
                break;
            else {
                rs.push(nc[1]);
                c = nc[0];
            }
        }
        if ( rs.length == 0 )
            return null;
        return mkR(c,rs);
    });
}

function manyPOrNothing(p) {
    return mkP(function(c){
        var rs = [];
        var nc = null;
        for (;;) {
            nc = p(c);
            if ( nc == null )
                break;
            else {
                rs.push(nc[1]);
                c = nc[0];
            }
        }
        return mkR(c,rs);
    });
}

function manyUntil(p,end) {
    return mkP(function(c){
        var rs = [];
        var nc = null;
        for (;;) {
            nc = p(c);
            if ( nc == null )
                break;
            else {
                rs.push(nc[1]);
                c = nc[0];
            }
            
            var endC = end(c);
            if ( endC != null )
                break;
        }
        if ( rs.length == 0 )
            return null;
        return mkR(c,rs);
    });
}

function until(p) {
    return mkP(function(c){
        var rs = "";
        var rr = null;
        var nc = null;
        for (;;) {
            if ( c.index > c.str.length ) return null;
            nc = p(c);
            if (nc != null) {
                rr = nc[1];
                c = nc[0];
                break;
            }
            else {
                rs += c.str[c.index];
                c = { index : c.index+1 , str : c.str };
            }
        }
        return mkR(c,{while:rs,end:rr});
    });
}

function untilAndStop(p) {
    return mkP(function(c){
        var rs = "";
        var nc = null;
        for (;;) {
            nc = p(c);
            if (nc != null) {
                break;
            }
            else {
                rs += c.str[c.index];
                c = { index : c.index+1 , str : c.str };
            }
        }
        return mkR(c,rs);
    });
}

var eolOrEof = mkP(function(c){
    if ( c.str.substr(c.index,1) == "\n" || c.str.substr(c.index,1) == "" )
        return mkR({ index : c.index+1 , str : c.str },"\n");
    else
        return null;
});

var parseWhiteSpaces = manyP(orP([takeString("\n"),takeString(" ")]));

var parseIntValue = mkP(function(c){
    var value = until(takeString(";"))(c);
    if ( value == null ) return null;
    var num = parseInt(value[1].while);
    if ( isNaN(num) ) return null;
    return mkR(value[0],num);
});

var parseFuncValue = mkP(function(c){
    var pOpen = takeString("(")(c);
    if ( pOpen == null ) return null;
    var params = until(takeString(")"))(pOpen[0]);
    if ( params == null ) return null;
    var arrow = takeString("=>{")(params[0]);
    if ( arrow == null ) return null;
    var meta = manyPOrNothing(parseMetaCond)(arrow[0]);
    if ( meta == null ) return null;
    var body = manyUntil(parsePrgLine,withoutWhite(takeString("};")))(meta[0]);
    if ( body == null ) return null;
    var bodyEnd = withoutWhite(takeString("};"))(body[0]);
    return mkR(bodyEnd[0],{ type : "func"
                          , params : params[1].while.split(",")
                          , meta : meta[1]
                          , body : body[1]
                          });
});

var parseMetaCond = mkP(function(c){
    var nls = parseWhiteSpaces(c);
    if ( nls != null ) c = nls[0];
    
    var mm = takeString("-- ")(c);
    if ( mm == null ) return null;
    var name = until(takeString(" "))(mm[0]);
    if ( name == null ) return null;
    var cond = until(takeString(" "))(name[0]);
    if ( cond == null ) return null;
    var value = parseIntValue(cond[0]);
    if ( value == null ) return null;
    
    return mkR(value[0],{ type : "cond"
                        , cond : cond[1].while
                        , var : name[1].while
                        , value : value[1]
                        });
});

var parseLet = mkP(function(c){
    var nls = parseWhiteSpaces(c);
    if ( nls != null ) c = nls[0];
    
    var TEST = until(takeString("\n"))(c);
    var keyword = takeString("let ")(c);
    if ( keyword == null ) return null;
    var name = until(takeString(" "))(keyword[0]);
    if ( name == null ) return null;
    var eq = takeString("= ")(name[0]);
    if ( eq == null ) return null;
    var value = orP([parseIntValue,parseFuncValue])(eq[0]);
    if ( value == null ) return null;
    var isF = typeof value[1] != "number";
    return mkR(value[0], { type : isF ? "letf" : "let"
                       , name : name[1].while
                       , value : value[1]
                       });
});

var parseFFI = mkP(function(c){
    var nls = parseWhiteSpaces(c);
    if ( nls != null ) c = nls[0];
    
    var ffi = takeString("ffi ")(c);
    if ( ffi == null ) return null;
    var fName = until(takeString("("))(ffi[0]);
    if ( fName == null ) return null;
    var params = until(takeString(");"))(fName[0]);
    if ( params == null ) return null;
    
    return mkR(params[0],{ type : "ffi"
                         , func : fName[1].while
                         , params : params[1].while.split(",")
                         });
});

var parseFuncCall = mkP(function(c){
    var nls = parseWhiteSpaces(c);
    if ( nls != null ) c = nls[0];
    
    var fName = until(takeString("("))(c);
    if ( fName == null ) return null;
    var params = until(takeString(");"))(fName[0]);
    if ( params == null ) return null;
    
    if ( fName[1].while == "let printN = " ) asd();
    
    return mkR(params[0],{ type : "fCall"
                         , func : fName[1].while
                         , params : params[1].while.split(",")
                         });
});

var parseIncrement = mkP(function(c){
    var nls = parseWhiteSpaces(c);
    if ( nls != null ) c = nls[0];
    
    var name = until(takeString(" += "))(c);
    if ( name == null ) return null;
    var value = parseIntValue(name[0]);
    if ( value == null ) return null;
    
    return mkR(value[0],{ type : "+="
                        , var : name[1].while
                        , value : value[1]
                        });
});

var parsePrgLine = orP([parseLet,parseFFI,parseIncrement,parseFuncCall]);

var parsePrg = mkP(function(c){
    var lines = manyP(parsePrgLine)(c);
    return lines;
});



if ( typeof document != "undefined" ) { // we are in a browser
    document.body.innerHTML = "<textarea id='input'></textarea><input onclick='submit()' type='submit' value='run'><input type='submit' value='clear' onclick='clearOutput()'></input></input><div id='output'></div>";
    inputArea = document.getElementById("input");
    outputArea = document.getElementById("output");
    
    clearOutput = function(){
        outputArea.innerHTML = "";
    };
    submit = function(){
        var ast = parseThing(inputArea.value,parsePrg)[1];
        
        var code = compile(ast);
        if ( code.error ) {
            outputArea.innerHTML = code.error;
        }
        else {
            eval(code.code);
        }
    };
}
else {
    var ast = parseThing(prgString,parsePrg)[1];
    
    
    log("CODE:")
    log(prgString);
    
    
    log("AST:");
    logJ(ast);
    log("\n\n");
    
    var code = compile(ast);
    
    if ( code.error ) {
        log(code.error);
    }
    else {
        log("Generated code:\n");
        log(code.code);
        
        log("\n\n==============\n\nPrg output:");
        eval(code.code);
    }
}