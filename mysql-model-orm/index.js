const sqlParse =  require("./lib/dbParse");
const mysql = require('mysql');
class connect{
    constructor(dbconfig={}){
      
        this.pool = mysql.createPool({
            "host": dbconfig.host ||'127.0.0.1',
            "user": dbconfig.user||'root',
            "password": dbconfig.password,
            "port": dbconfig.port||'3306',//端口
            "database": dbconfig.database
        })

    }
    execsql(sql,option=[]){
        var nowData = new Date().getTime();
        var _this = this;
        if(!sql) return {};
        return new Promise((solve,reject)=>{
            _this.pool.getConnection((err,coms)=>{
                if(err){
                    console.log(err)
                    reject("connect fail" +err);
                    return 
                }
               var resComs = coms.query(sql,option,(err,res,fields)=>{
                    coms.release();
                    if(err) {
                        console.log(err)
                        return  reject("query is error: "+ sql+ '  '+ err);

                    };
                    solve(res)
                })
                console.log("["+new Date().toLocaleString()+"] : sql -: " + resComs.sql + '; --time--: after ' + parseFloat(new Date().getTime()-nowData)+" ms ");
            })
        })
    }
    // 事务
    transaction(sqlArr){
        
        var _this = this;
        return new Promise((resolve,reject)=>{
            if(!sqlParse.isArray(sqlArr)){
                return reject("arg is must type Array");
            }
            _this.pool.getConnection((err,coms)=>{
                if(err){
                    reject("connect fail" +err);
                    return 
                }
                coms.beginTransaction(err=>{
                    if(err){
                        reject("connect fail" +err);
                        return 
                    }
                    
                    var resSQL = sqlArr.map( val =>  {
                        return new Promise((resolve,reject)=>{   
                            if(sqlParse.isString(val)){
                                
                                coms.query(val,(err,res,fields)=>{
                                    if(err) {
                                    return  coms.rollback(()=>{ reject(err) })
                                    };
                                    resolve(res);
                                })
                             
                            }else if(sqlParse.isArray(val)){

                                coms.query(val[0],val[1],(err,res,fields)=>{
                                    if(err) {
                                    return  coms.rollback(()=>{ reject(err) })
                                    };
                                    resolve(res);
                                })

                           
                            }else if(sqlParse.isObject(val)){
                                coms.query(val['sql'],val['value'],(err,res,fields)=>{
                                    if(err) {
                                    return  coms.rollback(()=>{ reject(err) })
                                    };
                                    resolve(res);
                                })
                               
                            }
                        })
                    })
                   
                    Promise.all(resSQL).then(res=>{
                        coms.commit(err=>{
                            if(err){
                                coms.rollback(()=>{reject(err)})
                            }else{
                                console.log("Transaction complete")
                                resolve("Transaction complete")
                            }
                        })
                    }).catch(err=>{
                        console.log(err)
                        coms.rollback(()=>{ reject(err) })
                    })   
                   
                   coms.release();
                })
            })
        })
    }
}


class model extends connect{
    constructor(dbconfig){
      
        super(dbconfig)
        this.build =false;
        this.options = {};
    }
    async error(err){
        console.log(err)
        return await {code:-101,mssage:JSON.stringify(err),status:false}
    }
    setInit(){
        this.options = {};
        this.build = false;
        return this
    }
    buildSql(){
        this.build =true;
        return this;
    }
    clearOtions(){
        this.options = {};
        return this;
    }
    table(val){
        this.options.table = val;
        return this;
    }
     noField(val){
        this.options.noField = val;
        return  this;
    }
    field(val){
        this.options.field = val;
        return this
    }
    where(val){
        this.options.where =  sqlParse.isString(val)?val.trim():val;
        return this;
    }
    join(val){
        this.options.join = val;
        return this;
    }
    limit(val){
        this.options.limit = val;
        return this;
    }
    group(val){
        this.options.group = val;
        return this;
    }
    having(val){
        this.options.having = val;
        return this;
    }
    order(val){
        this.options.order = val;
        return this;
    }
    union(val){
        this.options.union = val;
        return this
    }
    distinct(){
        this.options.distinct = true;
        return this;
    }
   
    async getNoField(){
        try {
            if(!this.options.noField) return '';
            if(sqlParse.isString(this.options.field)) this.options.field = this.options.field.split(',');
            if(!sqlParse.isArray(this.options.field)) this.options.field = [];
            if(sqlParse.isString(this.options.noField)){
                this.options.noField =  this.options.noField.split(",");
            }
            if(sqlParse.isArray(this.options.noField)&&this.options.noField.length){
                var reg = /as(.)+$/;
                var tables = this.options.table.replace(reg,"");
                var resField = await  this.execsql(sqlParse.parseDescSql(tables));
                resField = resField.map(itme=>itme.Field).filter(itme=>this.options.noField.indexOf(itme)==-1);
                var avias = this.options.table.match(reg);
                avias = avias?avias[1]:"";
                if(avias){
                    resField = resField.map(itme=>`${avias}.${itme}`);
                }
                this.options.field = [...new Set(resField),...new Set(this.options.field)];
                var index = this.options.field.indexOf("*");
                if(index > -1){this.options.field.splice(index,1);}   
            }
        } catch (error) {
        }
       
    }
    /**
     *  @param {return} Promise
     * */
    async select(){
        return new Promise(async (resolve,reject)=>{
            await this.getNoField();
            var sql = await sqlParse.parseSelectSql(this.options);
            if(this.build){
                await this.setInit();
                return await resolve(sql);
            }
            await this.setInit();
            try {
                var res = await this.execsql(sql);
                return await resolve(res);
            } catch (error) {
                await this.setInit();
                return await  reject(await this.error(error) );
            }
        })
       
    }
    async findOne(){
        return new Promise(async (resolve,reject)=>{
            try {
                this.limit(1);
                var res =await this.select();
                resolve( res[0]?res[0]:null)
            } catch (error) {
                await this.setInit();
                reject(error)
            }
        })
    }
    /**
     * 
     * @param {string|object|array} opt 
     * @return {promise} string
     */
    async add(opt,replace){  
        return new Promise( async (resolve,reject)=>{
            try {
                this.options.values = opt; 
                var sql = await sqlParse.parseInsertSql(this.options,replace)
                if(this.build){
                    await this.setInit();
                    return  resolve(await sql);
                }
                await this.setInit();
                var res = await this.execsql(sql);
               return resolve(await res.insertId?res.insertId:0)
            } catch (error) {
                await this.setInit();
               return  reject( await  this.error(error))
            }
        }) 
    }

     /**
     * 
     * @param {object} val 更新的数据 {name:"updateName"}
     * @param {object} options (可选)条件参数 {where:{id:1}} ;见where 方法参数;
     * @return {promise} string
     */
    async update(val,options){
        return new Promise(async (resolve,reject)=>{
            try {
                this.options.values = val;
                if(sqlParse.isObject(options))  this.options = Object.assign(this.options,options||{});
                if(!this.options.where){
                    return await  reject(this.error("update miss where or if all update where  parameter  is true"))
                }
                if(!sqlParse.isObject(val)){   
                    return await  reject(this.error("updata data is must object"))
                }
                var sql = sqlParse.parseUpdateSql(this.options);
                if(this.build){
                    await this.setInit();
                    return await resolve(sql);
                }
                await this.setInit();
                var res = await this.execsql(sql);           
                return await resolve( res.affectedRows?res.affectedRows:0);
            } catch (error) {
                await this.setInit();
                return  reject( await  this.error(error))
            }
        })
       
        
    }
      /**
     *批量更新
     * @param {array} opt 更新的数据 如： [{name:"updateName1",id:1},{name:"updateName2",id:2}]
     * @param {object} options (必填)条件参数字段 如： {key:"id"} ;id 字段将作为更新条件
     * @return {promise} string
     * 示例：
     * sql：update tk_table SET status = case id where 1 then 2 where 2 then 1 end where id in (1,2);
     */
    async updateMany(opt,options={key:"id"}){
  
        return new Promise(async (resolve,reject)=>{
            try {

                 // 第一种：
                if(!sqlParse.isArray(opt)||!opt.length){
                    return  reject(await this.error("updata data is must Array"));
                } 
                var arrKey =  Object.keys(opt[0])
                if(arrKey.indexOf(options.key)<0){
                    return  reject(await this.error("update data miss where in field key"));
                }
                var optArr = {};
                var whereArr = [];
                opt.forEach((itme,index)=>{
                    for (var key in itme) {
                        if (key ==options.key) {
                        whereArr.push(itme[key])
                        }else{
                        if(optArr[key]){
                            if(index==opt.length-1){
                                optArr[key].push([`when ${itme[options.key]} then  ${itme[key]} end`]);
                            }else{
                                optArr[key].push([`when ${itme[options.key]} then  ${itme[key]}`]);
                            }
                            
                        }else{
                            if(index==opt.length-1){
                                optArr[key] = [`${key} = case ${options.key} when ${itme[options.key]} then  ${itme[key]} end`];
                            }else{
                                optArr[key] = [`${key} = case ${options.key} when ${itme[options.key]} then  ${itme[key]}`];
                            }
                        }
    
                        }
                    }
                })
                var whenArr = [];
                for (var keys in optArr) {
                whenArr.push(`${optArr[keys].join(" ")}`);
                }
                var sqlStr=`update ${this.options.table} set ${whenArr.join(',')} where id in (${whereArr.join(",")})`;
                if(this.build){
                    await this.setInit();
                    return await resolve(sqlStr);
                }
                await this.setInit();
                var res = await this.execsql(sqlStr);
                return await resolve(true);

            } catch (error) {
                await this.setInit();
                return  reject( await  this.error(error))
            } 
        })
        // 第二种：(需要转入所有字段的值,不同原来的才更新，字段不全会报错)
        // if(!sqlParse.isArray(opt)||!opt.length){
        //     console.error(new Error("updata data is must Array"));
        //     return await  this.error("updata data is must Array")
        // } 
        // var arrKey =  Object.keys(opt[0])
        // if(arrKey.indexOf(options.key)<0){
        //     console.error(new Error("update data miss key"));
        //     return await  this.error("update data miss key")
        // }
        // arrKey.splice(arrKey.indexOf(options.key),1);
        // var reskey = arrKey.map((itme)=>{
        //     return `${itme} = values(${itme})`
        // })
        // this.options.where = "";
        // this.options.values = opt;
        // var sql = sqlParse.parseInsertSql(this.options) + "on duplicate key update " +reskey.join(",");
        // this.options = {};        
        // try {
        //     var res = await this.execsql(sql);
        //     return true;
        // } catch (error) {   
        //     return await this.error(error)
             
        // }
        
    }

    /**
     * 
    * @return {promise} string
     */
    async delete(){
        return new Promise(async (resolve,reject) =>{
            try {
                if(!this.options.where){
                    return  reject( await  this.error("delete miss where or if all delete where  parameter  is true"));
                };
                var sqlStr = sqlParse.parseDeleteSql(this.options);
                if(this.build){
                    await this.setInit();
                    return await resolve(sqlStr);
                }
                await this.setInit();
                var res = await this.execsql(sqlStr);
                return resolve( res.affectedRows?res.affectedRows:0);
            } catch (error) {
                await this.setInit();
                return  reject( await  this.error(error))
            }
        })
       
    }
    /**
     * 
    * @return {promise} 
     */
    async polyType({type,typeVal,flag}){
        return new Promise(async (resolve,reject)=>{
            try {
                this.options.type = type;
                this.options.typeVal = typeVal;
                var sqlStr = "";
                if(flag){
                    var options =  JSON.parse(JSON.stringify(this.options));
                    var inSql = sqlParse.parseFindTypeSql(Object.assign(options,{field:""}));
                    this.options.where = `${this.options.typeVal} in (${inSql})`;
                    sqlStr = sqlParse.parseSelectSql(this.options);
                }else{
                    var copeDta = this.options;
                   
                    sqlStr = sqlParse.parseFindTypeSql(copeDta);
                }
                if(this.build){
                    await this.setInit();
                    return await resolve(sqlStr);
                }
                await this.setInit();
                var res = await this.execsql(sqlStr);
                return await resolve(res.length?res:{});
            } catch (error) {
                await this.setInit();
                return  reject( await  this.error(error))
            }
        })   
    }
    async min(val){
        return this.polyType({type:"min",typeVal:val,flag:true});
    }
    async max(val){
        return this.polyType({type:"max",typeVal:val,flag:true});
    }
    async count(val){
        return this.polyType({type:"count",typeVal:val});
    }
    async sum(val){
        return this.polyType({type:"sum",typeVal:val});
    }

    async avg(val){
        return this.polyType({type:"avg",typeVal:val});
    }
    /**
     *
     * @param {page} Number
     * @param {limit} Number
     * @return {promise} 
     */
    async pageSelect(page=1,limit=10){
        await this.getNoField();
        this.options.limit =[page,limit];
        return new Promise(async (resolve,reject)=>{
            try {
                var data = JSON.parse(JSON.stringify(this.options));
                var res = await this.execsql(sqlParse.parseSelectSql(data));
               
                this.options.group = "";
                this.options.limit = await '';
                this.options.field = await this.options.field?this.options.field:"*";
                var count = await this.count();
                count = count.length?count[0].count:0;
                await this.setInit();
                return await resolve({code:200,mssage:"success",count:count,data:res});
            } catch (error) {
                await this.setInit();
                return reject(await this.error(error));
            }
        })
        
    }
    /**
     * @param {object} data
     * @param {object} options 见 this.options.where;
     * @return {promise} 
     */
    async thenAdd(data,options){
        var table = this.options.table;
        this.options.where = options || this.options.where;
        return new Promise(async (resolve,reject)=>{
            try {
                var resfind = await this.findOne();
                if(resfind){
                    return resolve( {type:"exist",id:""});
                }
                this.options.table = table;
                var resAdd = await this.add(data);
                await this.setInit();
                return resolve({type:"add",id:resAdd}) ;
            } catch (error) {
                await this.setInit();
               return  reject(error)
            }
        })
    }
      /**
     * @param {object} data
     * @param {object} options 见 this.options.where;
     * @return {promise} 
     */
    async thenUpdate(data,options){
        var table = this.options.table;
        var where = this.options.where;
        this.options.where = options;
        return new Promise(async (resolve,reject)=>{
            try {
                var resfind = await this.findOne();
                if(resfind){
                    return await resolve({type:"exist",id:""});
                }
                this.options.table = table;
                this.options.where = where;
                var resuUdate = await this.update(data);
                await this.setInit();
                if(resuUdate){
                    return await resolve({type:"update",id:""});
                }
               return await resolve(0)
            } catch (error) {
                await this.setInit();
               return reject(error)
            }
        
        })
    }
    
   /**
     * @param {object} options ;
     * @return {promise} 
     */
    async MormToMorm(options = {middleTable:"",relateTable:"",rkey:"",fkey:"",rfkey:""}){
       return new Promise(async (resolve,reject)=>{
            try {
                this.table(options.relateTable);
                this.join({table:options.middleTable,join:"right",on:`${options.rkey} = ${options.rfkey}`});
                var res = await this.execsql(sqlParse.parseSelectSql(this.options));
                var objRes = {};
                if(res&&res.length){
                    res.forEach(itme=>{
                        if(objRes[itme[options.fkey]]){
                            objRes[itme[options.fkey]].push(itme)
                        }else{
                            objRes[itme[options.fkey]] = [itme];
                        }
                    })
                }
                await this.setInit();
                return await resolve(objRes);
            } catch (error) {
                await this.setInit();
                return reject(this.error(error))
            }
       })
    }

}
module.exports = model;
