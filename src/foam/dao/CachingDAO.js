/**
 * @license
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
  CachingDAO will do all queries from its fast cache. Writes
  are sent through to the src and cached before resolving any put() or
  remove().
  <p>
  You can use a foam.dao.EasyDAO with caching:true to use caching
  automatically with an indexed MDAO cache.
  <p>
  The cache maintains full copy of the src, but the src is considered the
  source of truth.
*/
foam.CLASS({
  package: 'foam.dao',
  name: 'CachingDAO',
  extends: 'foam.dao.ProxyDAO',

  requires: [
    'foam.dao.PromisedDAO'
  ],

  properties: [
    {
      /** The source DAO on which to add caching. Writes go straight
        to the src, and cache is updated to match.
      */
      class: 'Proxy',
      of: 'foam.dao.DAO',
      name: 'src',
      topics: [],
      forwards: [ ], //'put', 'remove', 'removeAll' ],
      postSet: function(old, src) {
        // FUTURE: clean up this listener swap, forward methods directly
        if ( old ) {
          old.on.put.unsub(this.onSrcPut);
          old.on.remove.unsub(this.onSrcRemove);
          old.on.reset.unsub(this.onSrcReset);
        }
        src.on.put.sub(this.onSrcPut);
        src.on.remove.sub(this.onSrcRemove);
        src.on.reset.sub(this.onSrcReset);
      }
    },
    {
      /** The cache to read items quickly. Cache contains a complete
        copy of src. */
      name: 'cache',
    },
    {
      /**
        Set .cache rather than using delegate directly.
        Read operations and notifications go to the cache, waiting
        for the cache to preload the complete src state. 'Unforward'
        ProxyDAO's default forwarding of put/remove/removeAll.
        @private
      */
      class: 'Proxy',
      of: 'foam.dao.DAO',
      name: 'delegate',
      hidden: true,
      forwards: [ 'find', 'select' ],
      expression: function(src, cache) {
        // Preload src into cache, then proxy everything to cache that we
        // don't override explicitly.
        var self = this;
        var cacheFilled = cache.removeAll().then(function() {
          // First clear cache, then load the src into the cache
          return src.select(cache).then(function() {
            return cache;
          });
        });
        // The PromisedDAO resolves as our delegate when the cache is ready to use
        return this.PromisedDAO.create({
          promise: cacheFilled
        });
      }
    },
  ],

  methods: [
    /** Puts are sent to the cache and to the source, ensuring both
      are up to date. */
    function put(o) {
      var self = this;
      // ensure the returned object from src is cached.
      return self.src.put(o).then(function(srcObj) {
        return self.delegate.put(srcObj);
      })
    },
    /** Removes are sent to the cache and to the source, ensuring both
      are up to date. */
    function remove(o) {
      var self = this;
      return self.src.remove(o).then(function() {
        return self.delegate.remove(o);
      })
    },
   /** removeAll is executed on the cache and the source, ensuring both
      are up to date. */
    function removeAll(skip, limit, order, predicate) {
      var self = this;
      return self.src.removeAll(skip, limit, order, predicate).then(function() {
        return self.delegate.removeAll(skip, limit, order, predicate);
      })
    }

  ],

  listeners: [
    /** Keeps the cache in sync with changes from the source.
      @private */
    function onSrcPut(s, on, put, obj) {
      this.delegate.put(obj);
    },

    /** Keeps the cache in sync with changes from the source.
      @private */
    function onSrcRemove(s, on, remove, obj) {
      this.delegate.remove(obj);
    },

    /** Keeps the cache in sync with changes from the source.
      @private */
    function onSrcReset() {
      // TODO: Should this removeAll from the cache?
    }
  ]
});
