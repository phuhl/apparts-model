"use strict";

//const Errors = require('apparts-error');
const User = require('./user.js');

function NotUnique(){
  this.message = `[Model] Object not unique. E4`;
  this.toString = () => this.message;
}
function NotFound(){
  this.message = `[Model] Object not found. E25`;
  this.toString = () => this.message;
}
function DoesExist(){
  this.message = `[Model] Object does exist. E32`;
  this.toString = () => this.message;
}

module.exports = (dbs) => {

  // No idea why, but has to be here to be populated
  const type = require('apparts-types');

  return class Model {
    constructor(types, collection, contents){
      this._fromDB = false;
      this._collection = colprefix + collection;
      this._types = types;
      this._keys = Object.keys(types).filter(key => types[key].key);
      if(!types || !this._types._id || !this._types._id.key){
        throw "[Model] E41, No types given or types not well defined";
      }
      if(!collection){
        throw "[Model] E23, No collection given";
      }
      if(contents){
        if(Array.isArray(contents)){
          this.contents = contents;
        } else {
          this.contents = [contents];
        }
        for(let key in this._types){
          if(typeof this._types[key].default === 'function'){
            this.contents.forEach(c => {
              c[key] = c[key] || this._types[key].default(c);
            });
          } else if(this._types[key].default !== undefined) {
            this.contents.forEach(c => {
              c[key] = c[key] || this._types[key].default;
            });
          }
        }
      } else {
        this.contents = [];
      }
    }

    load(filter, limit, order){
      return this._load(
        dbs.collection(this._collection).find(filter, limit, order));
    }

    _load(f){
      if(this._fromDB){
        throw "[Model] load but already loaded, E3";
      }
      // MONGO
      return f.toArray()
        .then(cs => {
          this._fromDB = true;
          this.contents = cs.map(c => this._convertIds(c));
          this._loadedIds = cs.map(c => c._id);
          return Promise.resolve(this);
        });
      // .catch(err =>  Promise.reject(Errors.severe(err)));
    }

    _convertIds(c){
      for(let key in this._types){
        if(!c[key]){
          continue;
        }
        if(this._types[key].type === "id"){
          c[key] = dbs.fromId(c[key]);
        } else if(this._types[key].type === "array_id"){
          c[key] = c[key].map(v => dbs.fromId(v));
        }
      }
      return c;
    }

    loadById(id){
      // MONGO
      if(typeof id === 'object'){
        let req = {};
        if(Object.keys(id).length !== this._keys.length){
          throw `[Model] loadById not all keys given, E49.
Collection: "${this._collection}", Keys: "${this._keys}", Id: "${id}"`;
        }
        this._keys.forEach(key => {
          if(this._types[key].type === 'id'){
            req[key] = dbs.toId(id[key]);
          } else {
            req[key] = id[key];
          }
        });
        return this._loadOne(
          dbs.collection(this._collection).findById(req));
      } else {
        if(this._keys.length > 1){
          throw `[Model] loadById not all keys given, E49.
Collection: "${this._collection}", Keys: "${this._keys}", Id: "${id}"`;
        }
        return this._loadOne(
          dbs.collection(this._collection).findById({ _id: dbs.toId(id)}));
      }
    }

    loadByIds(ids, limit){
      // MONGO
      if(!Array.isArray(ids)){
        let req = {};
        if(Object.keys(ids).length !== this._keys.length){
          throw `[Model] loadByIds not all keys given, E50.
Collection: "${this._collection}", Keys: "${this._keys}", Id: "${ids}"`;
        }
        this._keys.forEach(key => {
          if(this._types[key].type === 'id'){
            if(Array.isArray(ids[key])){
              req[key] = ids[key].map(id => dbs.toId(id));
            } else {
              req[key] = dbs.toId(ids[key]);
            }
          } else {
            req[key] = ids[key];
          }
        });
        return this._load(
          dbs.collection(this._collection).findByIds(req, limit));
      } else {
        if(this._keys.length > 1){
          throw `[Model] loadByIds not all keys given, E50.
Collection: "${this._collection}", Keys: "${this._keys}", Id: "${ids}"`;
        }
        return this._load(
          dbs.collection(this._collection).findByIds(
            { _id: ids.map(id => dbs.toId(id))}, limit));
      }
    }


    loadOne(filter){
      return this._loadOne(
        dbs.collection(this._collection).find(filter, 2));
    }

    _loadOne(f){
      return this._load(f)
        .then(() => {
          if(this.contents.length > 1){
            return Promise.reject(new NotUnique());
          } else if(this.contents.length < 1){
            return Promise.reject(new NotFound());
          } else {
            return Promise.resolve(this);
          }
        });
    }

    loadNone(filter){
      return this.load(filter)
        .then(() => {
          if(this.contents.length > 0){
            return Promise.reject(new DoesExist());
          }
          return Promise.resolve(this);
        });
    }

    store(){
      if(this.contents.length < 1){
        return Promise.resolve();
      }
      if(!this._checkTypes()){
        throw "[Model] type-constraints not met, E42"
          + JSON.stringify(this.contents);
      }
      let withId = false;
      if(this.contents[0]._id !== undefined){
        withId = true;
      }
      // MONGO
      this.contents =
        this.contents.map(
          // MONGO
          c => ({ ...c, _id: c._id || dbs.newId()}));
      return dbs.collection(this._collection)
        .insert(this.contents, undefined, withId)
        .then((ids) => {
          if(ids){
            this.contents =
              this.contents.map(
                (c, i) => ({ ...c, _id: ids[i]}));
          }
          return Promise.resolve(this);
        });
    }

    storeUnique(){
      return this.store()
        .then(x => Promise.resolve(x))
        .catch(err => {
          // MONGO
          if(err._code === 1){
            return Promise.reject(new DoesExist());
          } else {
            throw "[Model] Unexpected error in storeUnique: " + err;
          }
        });
    }

    update(){
      if(!this._fromDB){
        throw "[Model] update on non-loaded Model, E29";
      }
      let newIds = this.contents.map(c => c._id);
      if(!(this._loadedIds.length === newIds.length &&
           this._loadedIds.every((v, i) => newIds[i] === v))){
        throw "[Model] tried to update but IDs did not match loaded IDs, E46";
      }
      if(this.contents.length > 1){
        // MONGO
        return Promise.all(this.contents.map(c => this._updateOne(c)))
          .then(() => Promise.resolve(this));
      } else {
        if(this.contents.length > 0){
          return this._updateOne(this.contents[0]);
        } else {
          return Promise.resolve(this);
        }
      }
    }

    _updateOne(c){
        // MONGO
      return dbs.collection(this._collection).updateOne(
        { _id : c._id }, c)
        .then(() => Promise.resolve(this))
        .catch(err => { throw err; });
    }

    content(){
      return this.contents[0];
    }

    length(){
      return this.contents.length;
    }

    setAll(field, val){
      this.contents.forEach(c => c[field] = val);
      return this;
    }

    setAllF(field, f){
      this.contents.forEach(c => c[field] = f(c));
      return this;
    }

    setOne(field, val){
      this.contents[0][field] = val;
      return this;
    }

    delete(){
      if(!this._fromDB){

      }
      if(this.contents.length !== 1){
        throw "[Model] delete of multiple or one, E27";
      }
      // MONGO
      return dbs.collection(this._collection)
        .remove({ _id: this.contents[0]._id })
        .catch(err => { throw err; });
    }

    deleteAll(){
      if(this.length() == 0){
        return Promise.resolve();
      }
      // MONGO
      return dbs.collection(this._collection).remove(
        { _id: { val: this.contents.map(c => c._id), op: 'in' }})
        .catch(err => { throw err; });
    }

    _checkTypes(){
      for(let c of this.contents){
        for(let key in this._types){
          if(key === "_id"){
            continue;
          }
          let val = c[key];
          if(this._types[key].derived){
            val = this._types[key].derived(c);
          }
          if(this._types[key].persisted === false){
            delete c[key];
            continue;
          }
          let present = val !== undefined && val !== null;
          if((!present && !this._types[key].optional)
             || (present && !type.types[this._types[key].type].check(val))){
            console.log(key, val);
            return false;
          }
        }
      }
      return true;
    }

    getPublic(single){
      return this.getPublicWithTypes(this._types, single);
    }

    getPublicWithTypes(types, single){
      let hasName = false;
      for(let key in types){
        if(types[key].name){
          if(hasName){
            throw "[Model] E45, Multiple Names specified";
          }
          hasName = true;
        }
      }

      let retObj = {};
      if(!hasName){
        retObj = [];
      }
      for(let c of this.contents){
        let obj = {};
        for(let key in types){
          let val = c[key];
          if(types[key].derived){
            val = types[key].derived(c);
          }
          if(types[key].public && val !== undefined){
            if(types[key].mapped){
              obj[types[key].mapped] = val;
            } else {
              obj[key] = val;
            }
          }
          if(types[key].name){
            if(types[key].groupBy){
              retObj[val] = (retObj[val] || []);
              retObj[val].push(obj);
            } else {
              retObj[val] = obj;
            }
          }
        }
        if(!hasName){
          retObj.push(obj);
        }
      }
      if(single){
        if(!hasName){
          return retObj[0];
        } else {
          return retObj[Object.keys(retObj)[0]];
        }
      }
      return retObj;
    }
  };
};


/*
 * Allows running jest-test in parallel by using a different
 * collection on every test
 */
let colprefix = '';
module.exports._setColPrefix = prefix => {
  colprefix = prefix;
};

module.exports.NotUnique = NotUnique;
module.exports.NotFound = NotFound;
module.exports.DoesExist = DoesExist;
module.exports.Interfaces = {
  User
};
